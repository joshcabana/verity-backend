export {};

declare global {
  namespace Express {
    interface Request {
      user?: {
        sub?: string;
        id?: string;
        userId?: string;
      };
    }
  }
}
