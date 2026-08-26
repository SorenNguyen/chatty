import type { ServerToClientEvents } from "@chatty/shared-types";
import { useEffect, useRef } from "react";
import { getSocket } from "@/lib/socket";

/**
 * Subscribes to one server event for as long as the component is mounted.
 *
 * The handler lives in a ref and the effect depends only on the event name, so
 * the listener is attached once rather than being torn down and re-attached on
 * every render. Re-subscribing each render leaks handlers and can drop an event
 * that arrives in the gap between the two.
 *
 * Typed against `ServerToClientEvents`, so the handler's arguments are inferred
 * from the shared contract — passing a handler with the wrong shape fails to
 * compile instead of silently receiving something else.
 */
export function useSocketEvent<EventName extends keyof ServerToClientEvents>(
	eventName: EventName,
	handler: ServerToClientEvents[EventName],
): void {
	const handlerRef = useRef(handler);
	handlerRef.current = handler;

	useEffect(() => {
		// socket.io types `on`/`off` with a conditional that distinguishes app
		// events from reserved ones ("connect", "disconnect", ...). TypeScript
		// cannot resolve that while `EventName` is an unresolved generic, so the
		// plumbing is narrowed to a plain string-keyed emitter here.
		//
		// The loosening stops at this line: the hook's signature above still
		// checks the caller's handler against ServerToClientEvents, which is the
		// part that can actually be got wrong.
		const socket = getSocket() as unknown as {
			on(event: string, listener: (...args: unknown[]) => void): void;
			off(event: string, listener: (...args: unknown[]) => void): void;
		};

		// Delegating through the ref is what keeps the listener identity stable
		// while still calling the newest handler.
		const listener = (...args: unknown[]) => {
			(handlerRef.current as (...handlerArgs: unknown[]) => void)(...args);
		};

		socket.on(eventName, listener);

		return () => {
			socket.off(eventName, listener);
		};
	}, [eventName]);
}
