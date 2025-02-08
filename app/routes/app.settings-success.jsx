import { json } from "@remix-run/node";
import { Button, Card, Box, Text, Page, BlockStack } from "@shopify/polaris";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const sessionId = session.id;

  const userEnv = await prisma.userEnv.findUnique({ where: { sessionId } });

  if (!userEnv) {
    throw new Response("No settings found for this session.", { status: 404 });
  }
  return json({ userEnv });
};
export default function SettingsSuccess() {
  const { userEnv } = useLoaderData();
  return (
    <Page title="Congrats!">
      <Card roundedAbove="sm">
        <Text variant="headingSm" as="h1">
          Settings Saved Successfully!
        </Text>

        <Box paddingBlock="200">
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm" fontWeight="medium">
              OpenAI API key:
            </Text>
            <Text as="p" variant="bodyMd">
              {userEnv.openaiApiKey}
            </Text>
          </BlockStack>
        </Box>
        <Box paddingBlock="200">
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm" fontWeight="medium">
              Pinecone API Env:
            </Text>
            <Text as="p" variant="bodyMd">
              {userEnv.pineconeApiKey}
            </Text>
          </BlockStack>
        </Box>
        <Box paddingBlock="200">
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm" fontWeight="medium">
              Pinecone API Env:
            </Text>
            <Text as="p" variant="bodyMd">
              {userEnv.pineconeApiEnv}
            </Text>
          </BlockStack>
        </Box>
        <Box paddingBlock="200">
          <Text as="p" variant="bodyMd">
            Your API keys have been stored.
          </Text>
          <Box paddingBlock="200">
            <Button size="Large" url="/app/settings">
              Go back
            </Button>
          </Box>
        </Box>
      </Card>
    </Page>
  );
}
