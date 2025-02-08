import { useState } from "react";
import { Form, useActionData } from "@remix-run/react";
import { json } from "@remix-run/node";
import { Page, FormLayout, TextField, Button } from "@shopify/polaris";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

// Action function remains unchanged.
export let action = async ({ request }) => {
  const { session, redirect: adminRedirect } =
    await authenticate.admin(request);
  console.log("Authenticated session:", session);

  const formData = await request.formData();
  const openaiApiKey = formData.get("openaiApiKey");
  const pineconeApiKey = formData.get("pineconeApiKey");
  const pineconeApiEnv = formData.get("pineconeApiEnv");

  if (!openaiApiKey || !pineconeApiKey || !pineconeApiEnv) {
    return json({ error: "All fields are required" }, { status: 400 });
  }

  const sessionId = session.id;

  await prisma.session.upsert({
    where: { id: sessionId },
    update: {},
    create: {
      id: sessionId,
      shop: session.shop,
      state: session.state,
      isOnline: session.isOnline,
      accessToken: session.accessToken,
    },
  });

  await prisma.userEnv.upsert({
    where: { sessionId },
    update: {
      openaiApiKey,
      pineconeApiKey,
      pineconeApiEnv,
    },
    create: {
      sessionId,
      openaiApiKey,
      pineconeApiKey,
      pineconeApiEnv,
    },
  });

  console.log("keys saved", openaiApiKey, pineconeApiKey, pineconeApiEnv);
  return adminRedirect("/app/settings-success");
};

export default function SettingsPage() {
  // Create state for each field.
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [pineconeApiKey, setPineconeApiKey] = useState("");
  const [pineconeApiEnv, setPineconeApiEnv] = useState("");

  return (
    <Page title="Env variables">
      <Form method="post">
        <FormLayout>
          <TextField
            label="OPENAI API KEY"
            name="openaiApiKey"
            type="text"
            autoComplete="off"
            value={openaiApiKey}
            onChange={setOpenaiApiKey}
            required
          />
          <TextField
            label="PINECONE API KEY"
            name="pineconeApiKey"
            type="text"
            autoComplete="off"
            value={pineconeApiKey}
            onChange={setPineconeApiKey}
            required
          />
          <TextField
            label="PINECONE API ENV"
            name="pineconeApiEnv"
            type="text"
            autoComplete="off"
            value={pineconeApiEnv}
            onChange={setPineconeApiEnv}
            required
          />
          <Button submit primary>
            Save Keys
          </Button>
        </FormLayout>
      </Form>
    </Page>
  );
}
