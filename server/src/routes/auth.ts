import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { signAuthToken, verifyAuthToken } from "../auth/jwt.js";

export const authRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toUserResponse(user: { id: string; username: string; email: string }) {
  return { id: user.id, username: user.username, email: user.email };
}

authRouter.post("/signup", async (req, res) => {
  const { username, email, password } = req.body ?? {};
  if (typeof username !== "string" || username.trim().length < 2) {
    return res.status(400).json({ error: "Username must be at least 2 characters." });
  }
  if (typeof email !== "string" || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }
  if (typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: normalizedEmail }, { username: username.trim() }] },
  });
  if (existing) {
    return res.status(409).json({ error: "An account with that email or username already exists." });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { username: username.trim(), email: normalizedEmail, passwordHash },
  });

  const token = signAuthToken({ userId: user.id });
  res.status(201).json({ token, user: toUserResponse(user) });
});

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !valid) {
    return res.status(401).json({ error: "Incorrect email or password." });
  }

  const token = signAuthToken({ userId: user.id });
  res.json({ token, user: toUserResponse(user) });
});

authRouter.get("/me", async (req, res) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  if (!token) return res.status(401).json({ error: "Not logged in." });

  try {
    const { userId } = verifyAuthToken(token);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(401).json({ error: "Not logged in." });
    res.json({ user: toUserResponse(user) });
  } catch {
    res.status(401).json({ error: "Your session has expired. Please log in again." });
  }
});
