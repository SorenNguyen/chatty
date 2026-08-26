import { setIO, type ChattyServer } from "../src/lib/socket-bus.js";

export interface CapturedEmit {
	room: string;
	event: string;
	payload: unknown;
}

export interface CapturedJoin {
	fromRoom: string;
	joinedRoom: string;
}

export interface CapturedLeave {
	fromRoom: string;
	leftRoom: string;
}

export interface FakeIO {
	emits: CapturedEmit[];
	joins: CapturedJoin[];
	leaves: CapturedLeave[];
}

/**
 * Installs a stand-in for the Socket.io server and returns the arrays it records
 * into, so tests can assert what was broadcast and which rooms were joined.
 *
 * Services call `getIO()`, which throws when no server has been set — that
 * strictness is right in production (a silent no-op would mean messages that
 * never arrive) but means every test touching those services must provide one.
 *
 * The cast is deliberate: `Server` has a hundred-odd members and the services
 * only use `.to(room).emit(...)` and `.in(room).socketsJoin(...)`. Implementing
 * the rest to satisfy the type would be noise that tests nothing.
 */
export function installFakeIO(): FakeIO {
	const emits: CapturedEmit[] = [];
	const joins: CapturedJoin[] = [];
	const leaves: CapturedLeave[] = [];

	const fakeIO = {
		to(room: string) {
			return {
				emit(event: string, payload: unknown) {
					emits.push({ room, event, payload });
				},
			};
		},
		in(fromRoom: string) {
			return {
				socketsJoin(joinedRoom: string) {
					joins.push({ fromRoom, joinedRoom });
				},
				socketsLeave(leftRoom: string) {
					leaves.push({ fromRoom, leftRoom });
				},
			};
		},
	};

	setIO(fakeIO as unknown as ChattyServer);

	return { emits, joins, leaves };
}
