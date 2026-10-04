import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/tenro/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleChatStream } = await import("@/lib/tenro/stream.server");
        return handleChatStream(request);
      },
    },
  },
});
