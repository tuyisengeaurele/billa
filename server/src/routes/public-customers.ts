import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const publicCustomersRouter = Router();

publicCustomersRouter.get("/:token", async (req, res) => {
  const { token } = req.params;

  const customer = await prisma.customer.findFirst({
    where: { portalToken: token },
    include: {
      documents: {
        where: { status: "FINALIZED" },
        orderBy: { issueDate: "desc" },
        select: {
          id: true,
          type: true,
          number: true,
          status: true,
          issueDate: true,
          total: true,
          amountPaid: true,
          paymentStatus: true,
          publicToken: true,
        },
      },
    },
  });
  if (!customer) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  res.json({
    customer: { name: customer.name },
    documents: customer.documents,
  });
});
