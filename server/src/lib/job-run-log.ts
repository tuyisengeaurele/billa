import { prisma } from "./prisma.js";

export interface RecordJobRunInput {
  succeeded: boolean;
  resultCount?: number;
  errorMessage?: string;
}

export async function recordJobRun(jobName: string, input: RecordJobRunInput): Promise<void> {
  await prisma.jobRunLog.create({
    data: {
      jobName,
      succeeded: input.succeeded,
      resultCount: input.resultCount ?? null,
      errorMessage: input.errorMessage ?? null,
    },
  });
}
