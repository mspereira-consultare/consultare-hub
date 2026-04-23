import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user?: DefaultSession['user'] & {
      id?: string;
      role?: string;
      department?: string;
    };
  }

  interface User {
    role?: string;
    department?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    role?: string;
    department?: string;
  }
}
