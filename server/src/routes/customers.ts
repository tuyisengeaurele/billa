import { Router } from "express";
import type { Prisma } from "@prisma/client";
import * as Sentry from "@sentry/node";
import {
  customerListQuerySchema,
  customerSchema,
  customerUpdateSchema,
  importRowsRequestSchema,
  parseCustomerImportRow,
  sumByCurrency,
} from "@billa/shared";
import type { CustomerInput, CustomerListQuery, ImportRowsRequest } from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";
import { requireBusinessContext } from "../middleware/require-business.js";
import { requireActiveSubscription } from "../middleware/require-active-subscription.js";
import { generalApiRateLimit } from "../middleware/general-rate-limit.js";
import { validateBody } from "../middleware/validate.js";
import { validateQuery } from "../middleware/validate-query.js";
import { logActivity } from "../lib/activity-log.js";
import { getOutstandingInvoices } from "../lib/accounts-receivable.js";
import { buildPublicAssetUrl } from "../lib/asset-url.js";
import { buildStatementEmail } from "../lib/email-templates.js";
import { sendEmail } from "../lib/mailer.js";
import { toCsv } from "../lib/csv.js";
import { normalizeRwandaPhoneNumber } from "../lib/phone-number.js";

export const customersRouter = Router();

customersRouter.use(requireAuth);
customersRouter.use(requireBusinessContext);
customersRouter.use(generalApiRateLimit);
customersRouter.use(requireActiveSubscription);

function buildCustomersWhere(businessId: string, query: CustomerListQuery): Prisma.CustomerWhereInput {
  return {
    businessId,
    ...(query.includeInactive ? {} : { isActive: true }),
    ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
  };
}

customersRouter.get("/", validateQuery(customerListQuerySchema), async (req, res) => {
  const query = req.listQuery as CustomerListQuery;
  const businessId = req.auth!.businessId;

  const where = buildCustomersWhere(businessId, query);

  const [results, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { [query.sortBy]: query.sortOrder } as Prisma.CustomerOrderByWithRelationInput,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.customer.count({ where }),
  ]);

  res.json({ results, total, page: query.page, pageSize: query.pageSize });
});

customersRouter.get("/export.csv", validateQuery(customerListQuerySchema), async (req, res) => {
  const query = req.listQuery as CustomerListQuery;
  const businessId = req.auth!.businessId;

  const customers = await prisma.customer.findMany({
    where: buildCustomersWhere(businessId, query),
    orderBy: { name: "asc" },
  });

  const csv = toCsv(
    customers.map((c) => ({
      name: c.name,
      phone: c.phone ?? "",
      email: c.email ?? "",
      tin: c.tin ?? "",
      status: c.isActive ? "Active" : "Inactive",
    })),
    [
      { key: "name", header: "Name" },
      { key: "phone", header: "Phone" },
      { key: "email", header: "Email" },
      { key: "tin", header: "TIN" },
      { key: "status", header: "Status" },
    ],
  );

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="customers.csv"');
  res.send(csv);
});

customersRouter.get("/:id", async (req, res) => {
  const businessId = req.auth!.businessId;
  const { id } = req.params;

  const customer = await prisma.customer.findFirst({ where: { id, businessId } });
  if (!customer) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  // What they still owe across finalized invoices, so a new invoice can be weighed against their credit limit.
  const outstanding = await getOutstandingInvoices(businessId, id);
  // The credit limit is in RWF, so a foreign invoice counts at the rate saved on it.
  const outstandingBalance = outstanding.reduce((sum, invoice) => sum + Math.max(invoice.amountOwedRwf, 0), 0);

  res.json({ customer: { ...customer, outstandingBalance } });
});

customersRouter.post("/:id/send-statement", async (req, res) => {
  const businessId = req.auth!.businessId;
  const { id } = req.params;

  const customer = await prisma.customer.findFirst({ where: { id, businessId } });
  if (!customer) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (!customer.email) {
    res.status(400).json({ error: "customer_has_no_email" });
    return;
  }

  const outstanding = (await getOutstandingInvoices(businessId, id)).filter((invoice) => invoice.amountOwed > 0);
  if (outstanding.length === 0) {
    res.status(409).json({ error: "nothing_owed" });
    return;
  }

  const [business, sender] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: businessId } }),
    prisma.user.findUnique({ where: { id: req.auth!.userId } }),
  ]);
  const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
  const { subject, html } = buildStatementEmail({
    customerName: customer.name,
    businessName: business.name,
    businessAddress: business.address,
    businessPhone: business.phone,
    businessEmail: business.email,
    businessLogoUrl: buildPublicAssetUrl(business.logoUrl),
    sender: sender ? { name: sender.name, phone: sender.phone, email: sender.email } : null,
    portalUrl: `${clientOrigin}/portal/${customer.portalToken}`,
    payable: business.momoEnabled,
    invoices: outstanding.map((invoice) => ({
      number: invoice.number,
      dueDate: invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : null,
      amountOwed: invoice.amountOwed,
      currency: invoice.currency,
    })),
  });

  try {
    await sendEmail({ to: customer.email, subject, html });
  } catch (err) {
    Sentry.captureException(err);
    res.status(502).json({ error: "email_send_failed" });
    return;
  }

  res.json({
    sentTo: customer.email,
    invoiceCount: outstanding.length,
    totalOwed: outstanding.reduce((sum, invoice) => sum + invoice.amountOwedRwf, 0),
    totals: sumByCurrency(outstanding.map((invoice) => ({ currency: invoice.currency, amount: invoice.amountOwed }))),
  });
});

customersRouter.get("/:id/payment-stats", async (req, res) => {
  const businessId = req.auth!.businessId;
  const { id } = req.params;

  const customer = await prisma.customer.findFirst({ where: { id, businessId } });
  if (!customer) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const paidInvoices = await prisma.document.findMany({
    where: {
      businessId,
      customerId: id,
      type: "INVOICE",
      status: "FINALIZED",
      paymentStatus: "PAID",
      dueDate: { not: null },
    },
    select: {
      dueDate: true,
      payments: {
        where: { voidedAt: null },
        orderBy: { paidOn: "desc" },
        take: 1,
        select: { paidOn: true },
      },
    },
  });

  const daysToPay = paidInvoices
    .filter((doc) => doc.payments.length > 0)
    .map((doc) => {
      const msPerDay = 24 * 60 * 60 * 1000;
      return Math.round((doc.payments[0]!.paidOn.getTime() - doc.dueDate!.getTime()) / msPerDay);
    });

  const paidInvoiceCount = daysToPay.length;
  const averageDaysToPay =
    paidInvoiceCount > 0 ? Math.round(daysToPay.reduce((sum, days) => sum + days, 0) / paidInvoiceCount) : null;
  const onTimeRate =
    paidInvoiceCount > 0
      ? Math.round((daysToPay.filter((days) => days <= 0).length / paidInvoiceCount) * 100)
      : null;

  res.json({ paidInvoiceCount, averageDaysToPay, onTimeRate });
});

customersRouter.post("/import", validateBody(importRowsRequestSchema), async (req, res) => {
  const businessId = req.auth!.businessId;
  const { rows } = req.body as ImportRowsRequest;

  const existing = await prisma.customer.findMany({ where: { businessId }, select: { name: true, phone: true, tin: true } });
  const phones = new Set(existing.flatMap((c) => (c.phone ? [normalizeRwandaPhoneNumber(c.phone)] : [])));
  const tins = new Set(existing.flatMap((c) => (c.tin ? [c.tin.trim().toLowerCase()] : [])));
  const names = new Set(existing.map((c) => c.name.trim().toLowerCase()));

  const toCreate: CustomerInput[] = [];
  const skipped: { row: number; reason: string }[] = [];
  const invalid: { row: number; error: string }[] = [];

  rows.forEach((raw, index) => {
    const row = index + 1;
    const parsed = parseCustomerImportRow(raw);
    if (!parsed.ok) {
      invalid.push({ row, error: parsed.error });
      return;
    }
    const customer = parsed.value;
    const phone = customer.phone ? normalizeRwandaPhoneNumber(customer.phone) : null;
    const tin = customer.tin?.trim().toLowerCase() ?? null;
    const name = customer.name.trim().toLowerCase();

    let reason: string | null = null;
    if (phone && phones.has(phone)) reason = "Already a customer with this phone number";
    else if (tin && tins.has(tin)) reason = "Already a customer with this TIN";
    else if (names.has(name)) reason = "Already a customer with this name";
    if (reason) {
      skipped.push({ row, reason });
      return;
    }

    if (phone) phones.add(phone);
    if (tin) tins.add(tin);
    names.add(name);
    toCreate.push(customer);
  });

  if (toCreate.length > 0) {
    await prisma.customer.createMany({ data: toCreate.map((customer) => ({ ...customer, businessId })) });
  }

  res.json({ created: toCreate.length, skipped, invalid });
});

customersRouter.post("/", validateBody(customerSchema), async (req, res) => {
  const customer = await prisma.customer.create({
    data: { ...req.body, businessId: req.auth!.businessId },
  });

  await logActivity({
    businessId: req.auth!.businessId,
    actorUserId: req.auth!.userId,
    action: "CUSTOMER_CREATED",
    entityType: "Customer",
    entityId: customer.id,
    metadata: { name: customer.name },
  });

  res.status(201).json({ customer });
});

customersRouter.patch("/:id", validateBody(customerUpdateSchema), async (req, res) => {
  const businessId = req.auth!.businessId;
  const { id } = req.params;

  const result = await prisma.customer.updateMany({
    where: { id, businessId },
    data: req.body,
  });

  if (result.count === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const customer = await prisma.customer.findUnique({ where: { id } });

  if (req.body.isActive === false) {
    await logActivity({
      businessId,
      actorUserId: req.auth!.userId,
      action: "CUSTOMER_DEACTIVATED",
      entityType: "Customer",
      entityId: id,
      metadata: customer ? { name: customer.name } : undefined,
    });
  }

  res.json({ customer });
});
