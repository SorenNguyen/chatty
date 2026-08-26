import { Router } from "express";
import { changePasswordRateLimiter, loginRateLimiter, registerRateLimiter } from "../../middlewares/rate-limit.js";
import { requireAuth } from "../../middlewares/require-auth.js";
import { changePasswordController, loginController, registerController } from "./auth.controller.js";

export const authRouter = Router();

// Limiters run before the controllers: a rejected request must not reach the
// database, or the cost of probing is the same as the cost of a real signup.
authRouter.post("/register", registerRateLimiter, registerController);
authRouter.post("/login", loginRateLimiter, loginController);

// `requireAuth` before the limiter, not after: the limiter counts per user id,
// so it needs one to exist — and an unauthenticated flood must not be able to
// spend a real account's budget. The two auth routes above are the other way
// round because nobody is signed in yet when they run.
authRouter.post("/password", requireAuth, changePasswordRateLimiter, changePasswordController);
