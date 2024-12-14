import { currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import NewsletterWelcomeEmail from "~/components/emails/newsletter-welcome-email";
import { env } from "~/env.js";
import { db } from "~/server/db";
import { notifications } from "~/server/db/schema";
import { resend } from "~/server/resend";
import { joinNewsletterSchema } from "~/server/validations/notification";

export async function POST(req: Request) {
  const input = joinNewsletterSchema.parse(await req.json());

  try {
    const notification = await db
      .select({
        id: notifications.id,
        newsletter: notifications.newsletter,
        email: notifications.email,
        token: notifications.token,
      })
      .from(notifications)
      .where(eq(notifications.email, input.email))
      .execute()
      .then((res) => res[0]);

    if (notification?.newsletter) {
      return new Response("You are already subscribed to the newsletter.", {
        status: 409,
      });
    }

    const user = await currentUser();

    await Promise.all([
      resend.emails.send({
        from: env.EMAIL_FROM_ADDRESS || "",
        to: input.email,
        subject: input.subject ?? "Welcome to TrendsAI",
        react: NewsletterWelcomeEmail({
          firstName: user?.firstName ?? "",
          fromEmail: env.EMAIL_FROM_ADDRESS || "",
          token: notification?.token ?? input.token,
        }),
      }),
      db
        .insert(notifications)
        .values({
          email: input.email,
          token: input.token,
          newsletter: true,
        })
        .onConflictDoUpdate({
          target: [notifications.email],
          set: {
            newsletter: true,
          },
        }),
    ]);

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error(error);

    if (error instanceof z.ZodError) {
      return new Response(error.message, { status: 422 });
    }

    if (error instanceof Error) {
      return new Response(error.message, { status: 500 });
    }

    return new Response("Something went wrong", { status: 500 });
  }
}
