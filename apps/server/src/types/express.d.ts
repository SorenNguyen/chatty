// Augments Express's own Request type with `userId`, set by requireAuth.
// Using declaration merging (rather than a separate `AuthenticatedRequest`
// interface) keeps `Request` itself the type Router.get/post expect —
// a custom subtype there confuses Express 5's handler overload resolution.
declare global {
	namespace Express {
		interface Request {
			userId?: string;
		}
	}
}

export {};
