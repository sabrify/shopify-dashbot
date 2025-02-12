import { BlockStack, Layout, Page, Card, DataTable } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { useLoaderData } from "@remix-run/react";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // Step 1: Initiate a bulk operation query to export products.
  const bulkQuery = `#graphql
    mutation {
      bulkOperationRunQuery(
        query: """
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

  // Step 2: Poll for the bulk operation to complete.
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

  // Step 4: Group nodes into products and variants.
  // - Product nodes have an id like "gid://shopify/Product/..." and no __parentId.
  // - Variant nodes include a __parentId field pointing to their parent product.
  const productsMap = {};
  rawNodes.forEach((node) => {
    if (node.id.includes("/Product/") && !node.__parentId) {
      // This is a product node.
      productsMap[node.id] = { ...node, variants: [] };
    } else if (node.__parentId) {
      // This is a variant node.
      if (!productsMap[node.__parentId]) {
        // If the product node hasn't been encountered yet, create a placeholder.
        productsMap[node.__parentId] = { id: node.__parentId, title: "Unknown", createdAt: "", variants: [] };
      }
      productsMap[node.__parentId].variants.push(node);
    }
  });
  const groupedProducts = Object.values(productsMap);
  console.log("Total grouped products:", groupedProducts.length);

  // Step 5: Preprocess each product into a text representation for embedding.
  // Each variant's details are formatted as "id: <id>, title: <title>, price: <price>".
  const preprocessedProducts = groupedProducts.map((product) => {
    const variantDetails = product.variants
      .map(
        (variant) =>
          `id: ${variant.id}, title: ${variant.title}, price: ${variant.price}`
      )
      .join(", ");
    const embeddingText = `Product: ${product.title}. Created at: ${product.createdAt}. Variants: ${variantDetails}.`;
    return {
      id: product.id,
      title: product.title,
      createdAt: product.createdAt,
      variants: product.variants,
      embeddingText, // This consolidated text can be used for embedding.
    };
  });

  console.log("Preprocessed products ready for embedding:", preprocessedProducts);
  return { products: preprocessedProducts };
};

export default function DataFetching() {
  const { products } = useLoaderData();
  const rows = products.map((product) => [
    product.title,
    product.createdAt,
    product.variants.map((variant) => variant.title).join(", "),
    product.embeddingText,
  ]);

  return (
    <Page>
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <DataTable
                  columnContentTypes={["text", "text", "text", "text"]}
                  headings={["Title", "Created", "Variants", "Embedding Text"]}
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
