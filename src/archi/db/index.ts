/**
 * `@archi/db` replacement: the original exported a Prisma client singleton plus the
 * generated model types. Here the client runs in the browser over persisted tables.
 */
import { createClient } from "./client";

export const prisma = createClient();

export { PrismaClientKnownRequestError, type Persistence } from "./client";
export * from "./schema.generated";

/** Subset of the Prisma namespace referenced by the ported services. */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Prisma {
  export type InputJsonValue = any;
  export type JsonValue = any;
  export type TaskEventCreateManyInput = {
    id?: string;
    taskId: string;
    type: string;
    payload?: InputJsonValue;
    createdAt?: Date;
  };
}
