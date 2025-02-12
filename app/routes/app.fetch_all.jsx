import { BlockStack, Layout, Page, Card, DataTable } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { useLoaderData } from "@remix-run/react";

// Helper: Returns the bulk query string for a given resource type.
function getBulkQueryForResource(resourceType) {
  switch (resourceType) {
    case "products":
      return `
        {
          products {
            edges {
              node {
                id
                title
                createdAt
                variants(first: 100) {
                  edges {
                    node {
                      id
                      title
                      price
                    }
                  }
                }
              }
            }
          }
        }
      `;
    case "orders":
      return `
        {
          orders {
            edges {
              node {
                id
                name
                createdAt
                totalPriceSet {
                  shopMoney {
                    amount
                  }
                }
              }
            }
          }
        }
      `;
    case "customers":
      return `
        {
          customers {
            edges {
              node {
                id
                firstName
                lastName
                email
                createdAt
              }
            }
          }
        }
      `;
    default:
      throw new Error("Unknown resource type");
  }
}

// Helper: Preprocess the raw nodes into records ready for embedding.
function preprocessNodes(rawNodes, resourceType) {
  let records = [];
  if (resourceType === "products") {
    // Group products and their variants.
    const productsMap = {};
    rawNodes.forEach((node) => {
      // Product node (no __parentId)
      if (node.id.includes("/Product/") && !node.__parentId) {
        productsMap[node.id] = { ...node, variants: [] };
      } else if (node.__parentId) {
        // Variant node: __parentId points to its product.
        if (!productsMap[node.__parentId]) {
          productsMap[node.__parentId] = {
            id: node.__parentId,
            title: "Unknown",
            createdAt: "",
            variants: [],
          };
        }
        productsMap[node.__parentId].variants.push(node);
      }
    });
    records = Object.values(productsMap).map((product) => {
      // Map each variant so that title and price are linked:
      const variantDetails = product.variants
        .map((variant) => `id: ${variant.id}, title: ${variant.title}, price: ${variant.price}`)
        .join(", ");
      const embeddingText = `Product: ${product.title}. Created at: ${product.createdAt}. Variants: ${variantDetails}.`;
      return {
        id: product.id,
        title: product.title,
        createdAt: product.createdAt,
        embeddingText,
      };
    });
  } else if (resourceType === "orders") {
    records = rawNodes.map((node) => {
      const embeddingText = `Order: ${node.name}. Created at: ${node.createdAt}. Total Price: ${
        node.totalPriceSet ? node.totalPriceSet.shopMoney.amount : "N/A"
      }.`;
      return {
        id: node.id,
        title: node.name,
        createdAt: node.createdAt,
        embeddingText,
      };
    });
  } else if (resourceType === "customers") {
    records = rawNodes.map((node) => {
      const embeddingText = `Customer: ${node.firstName} ${node.lastName}. Email: ${node.email}. Created at: ${node.createdAt}.`;
      return {
        id: node.id,
        title: `${node.firstName} ${node.lastName}`,
        createdAt: node.createdAt,
        embeddingText,
      };
    });
  }
  return records;
}

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // Set resourceType dynamically; change this to "orders" or "customers" as needed.
  const resourceType = "customers";

  // Step 1: Initiate the bulk operation for the chosen resource.
  const resourceQuery = getBulkQueryForResource(resourceType);
  const bulkQuery = `#graphql
    mutation {
      bulkOperationRunQuery(
        query: """
        ${resourceQuery}
        """
      ) {
        bulkOperation {
          id
          status
          errorCode
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  const bulkResponse = await admin.graphql(bulkQuery);
  const bulkResponseJson = await bulkResponse.json();
  console.log("Bulk operation run response:", bulkResponseJson);
  if (
    bulkResponseJson.data.bulkOperationRunQuery.userErrors &&
    bulkResponseJson.data.bulkOperationRunQuery.userErrors.length > 0
  ) {
    console.error("Bulk operation errors:", bulkResponseJson.data.bulkOperationRunQuery.userErrors);
    throw new Error("Bulk operation failed");
  }

  // Step 2: Poll for bulk operation completion.
  const pollQuery = `#graphql
    {
      currentBulkOperation {
        id
        status
        url
        errorCode
      }
    }
  `;
  let bulkOperationUrl = null;
  while (true) {
    console.log("Polling bulk operation status...");
    const pollResponse = await admin.graphql(pollQuery);
    const pollJson = await pollResponse.json();
    const currentOp = pollJson.data.currentBulkOperation;
    console.log("Current bulk operation:", currentOp);
    if (currentOp && currentOp.status === "COMPLETED") {
      bulkOperationUrl = currentOp.url;
      break;
    } else if (currentOp && currentOp.status === "FAILED") {
      console.error("Bulk operation failed:", currentOp.errorCode);
      throw new Error("Bulk operation failed");
    }
    // Wait 3 seconds before polling again.
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  console.log("Bulk operation completed. URL:", bulkOperationUrl);

  // Step 3: Fetch and parse the bulk operation results (JSONL format).
  const resultResponse = await fetch(bulkOperationUrl);
  const resultText = await resultResponse.text();
  const lines = resultText.split("\n").filter((line) => line.trim() !== "");
  const rawNodes = lines.map((line) => JSON.parse(line));
  console.log("Total raw nodes fetched:", rawNodes.length);

  // Step 4: Process the raw nodes into records based on the resource type.
  const records = preprocessNodes(rawNodes, resourceType);
  console.log("Preprocessed records ready for embedding:", records);

  return { records, resourceType };
};

export default function DataFetching() {
  const { records, resourceType } = useLoaderData();
  const rows = records.map((record) => [
    record.title,
    record.createdAt,
    record.embeddingText,
  ]);

  return (
    <Page title={`Bulk Data: ${resourceType}`}>
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <DataTable
                  columnContentTypes={["text", "text", "text"]}
                  headings={["Title", "Created", "Embedding Text"]}
                  rows={rows}
                />
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
