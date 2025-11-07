import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export function getToken(userID: String) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.log("Unable to get JWT_SECRET");
    process.exit(1);
  }
  const token = jwt.sign({ userID }, secret);
  return token;
}

export async function verifyToken(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error("JWT_SECRET not found");
      res.status(500).json({ message: "Server configuration error" });
      return;
    }
    if (!token) {
      res.status(400).json({
        message: "you are not loged in",
      });
      return;
    }
    const decoded = jwt.verify(token, secret) as { userId: string };
    if (typeof decoded === "string" || !("userId" in decoded)) {
      return res.status(401).json({ message: "Invalid token payload" });
    }

    (req as any).user = decoded.userId;
    next();
  } catch (err: any) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired" });
    }
    return res.status(401).json({ message: "Invalid token" });
  }
}
