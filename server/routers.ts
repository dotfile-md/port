import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { buildPortList, scanPorts } from "./portScanner";
import { z } from "zod";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  ports: router({
    scan: publicProcedure
      .input(
        z.object({
          mode: z.enum(["popular", "range", "custom"]),
          start: z.number().int().min(1).max(65535).optional(),
          end: z.number().int().min(1).max(65535).optional(),
          ports: z.array(z.number().int().min(1).max(65535)).max(256).optional(),
        }),
      )
      .query(({ input }) => scanPorts(buildPortList(input))),
    inspect: publicProcedure
      .input(z.object({ port: z.number().int().min(1).max(65535) }))
      .query(({ input }) => scanPorts([input.port]).then((results) => results[0])),
  }),

  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

export type AppRouter = typeof appRouter;
