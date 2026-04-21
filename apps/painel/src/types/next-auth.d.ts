import { DefaultSession } from "next-auth";
import type { PermissionMatrix } from "@/lib/permissions";

declare module "next-auth" {
  interface Session {
    user: {
      id?: string;
      role?: string;
      permissions?: PermissionMatrix;
    } & DefaultSession["user"];
  }

  interface User {
    id?: string;
    role?: string;
    permissions?: PermissionMatrix;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    permissions?: PermissionMatrix;
  }
}

