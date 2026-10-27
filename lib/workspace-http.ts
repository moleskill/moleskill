import { NextResponse } from "next/server";
import type { WsError } from "@/lib/workspace-admin";

const STATUS: Record<WsError, number> = {
  not_found: 404, forbidden: 403, personal_workspace: 409, last_owner: 409, invalid_name: 400, invalid_role: 400,
  invalid_email: 400, limit_reached: 409, invite_invalid: 404, invite_used: 410, invite_expired: 410, invite_email_mismatch: 403,
};

export const wsError = (error: WsError) => NextResponse.json({ error }, { status: STATUS[error] });
export const unauthorized = () => NextResponse.json({ error: "unauthorized" }, { status: 401 });
