import { Router } from "express";
import {
	changePasswordRateLimiter,
	emailChangeConfirmRateLimiter,
	emailChangeRateLimiter,
	loginRateLimiter,
	passwordResetConfirmRateLimiter,
	passwordResetRequestRateLimiter,
	refreshRateLimiter,
	registerRateLimiter,
} from "../../middlewares/rate-limit.js";
import { requireAuth } from "../../middlewares/require-auth.js";
import {
	changePasswordController,
	confirmEmailChangeController,
	loginController,
	logoutController,
	refreshSessionController,
	registerController,
	requestEmailChangeController,
	requestPasswordResetController,
	resetPasswordController,
} from "./auth.controller.js";

export const authRouter = Router();

// Limiters run before the controllers: a rejected request must not reach the
// database, or the cost of probing is the same as the cost of a real signup.
authRouter.post("/register", registerRateLimiter, registerController);
authRouter.post("/login", loginRateLimiter, loginController);

// Both unauthenticated, and that is the point rather than an oversight: a
// client calls these exactly when its access token has expired, so requiring one
// would make them useless at the only moment they matter. The refresh token in
// the body is the credential, and it is checked against a database row.
//
// `refresh` is limited because it is an unauthenticated endpoint that hashes and
// writes; `logout` is not, because a signed-out client that cannot sign out is a
// worse failure than a flood of no-op updates.
authRouter.post("/refresh", refreshRateLimiter, refreshSessionController);
authRouter.post("/logout", logoutController);

// `requireAuth` before the limiter, not after: the limiter counts per user id,
// so it needs one to exist — and an unauthenticated flood must not be able to
// spend a real account's budget. The two auth routes above are the other way
// round because nobody is signed in yet when they run.
authRouter.post("/password", requireAuth, changePasswordRateLimiter, changePasswordController);

// Unauthenticated, like register and login — someone who has forgotten their
// password by definition cannot present a token. The limiter therefore runs
// first here, the way it does for those two and unlike `/password` above.
authRouter.post("/password-reset", passwordResetRequestRateLimiter, requestPasswordResetController);
authRouter.post("/password-reset/confirm", passwordResetConfirmRateLimiter, resetPasswordController);

// Changing the address on an account is a credential change, which is why it is
// here rather than on `PATCH /users/me` with the display name: it needs the
// current password, it goes through the mailer, and it does not take effect when
// the request returns. Authenticated then limited, like `/password` above.
authRouter.post("/email", requireAuth, emailChangeRateLimiter, requestEmailChangeController);
// Unauthenticated, like the reset confirmation: the link is opened wherever the
// new mailbox is read, which is regularly a device that has never signed in.
authRouter.post("/email/confirm", emailChangeConfirmRateLimiter, confirmEmailChangeController);
