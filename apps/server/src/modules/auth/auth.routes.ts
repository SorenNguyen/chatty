import { Router } from "express";
import { loginRateLimiter, registerRateLimiter } from "../../middlewares/rate-limit.js";
import { loginController, registerController } from "./auth.controller.js";

export const authRouter = Router();

// Limiters run before the controllers: a rejected request must not reach the
// database, or the cost of probing is the same as the cost of a real signup.
authRouter.post("/register", registerRateLimiter, registerController);
authRouter.post("/login", loginRateLimiter, loginController);
