const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Prisma throws on malformed values for `@db.Uuid` columns, so validate ids before querying. */
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
