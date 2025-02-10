import { BlockStack, Layout, Page, Card, DataTable } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { useLoaderData } from "@remix-run/react";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  let allProducts = [];
  let cursor = null;
  let hasNextPage = true;
  const fetchCount = 2; // For testing with 19 products
  let previousEndCursor = null; // safeguard against unchanged cursor

  const query = `#graphql
    query GetProducts($cursor: String, $fetchCount: Int!) {
      products(first: $fetchCount, after: $cursor) {
        edges {
          cursor
          node {
            id
            title
            createdAt
            variants(first: 5) {
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
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  while (hasNextPage) {
    console.log("Fetching products with cursor:", cursor);
    const variables = { fetchCount, cursor };
    const response = await admin.graphql(query, { variables });
    const responseJson = await response.json();

    if (!responseJson.data || !responseJson.data.products) {
      console.error("Unexpected response format", responseJson);
      break;
    }

    const { edges, pageInfo } = responseJson.data.products;
    console.log(
      `Fetched ${edges.length} products. hasNextPage: ${pageInfo.hasNextPage}, endCursor: ${pageInfo.endCursor}`,
    );

    // Append the fetched products.
    allProducts.push(...edges);

    // If fewer than fetchCount products are returned, assume it's the last batch.
    if (edges.length < fetchCount) {
      console.log("Fetched less than fetchCount products. Breaking loop.");
      break;
    }

    // Safeguard: If the endCursor hasn't changed from the previous iteration, break.
    if (previousEndCursor && pageInfo.endCursor === previousEndCursor) {
      console.log(
        "End cursor did not change. Breaking loop to avoid infinite loop.",
      );
      break;
    }
    previousEndCursor = pageInfo.endCursor;

    // Update the cursor and hasNextPage for the next iteration.
    cursor = pageInfo.endCursor;
    hasNextPage = pageInfo.hasNextPage;
    console.log("Updated cursor to last product's cursor:", cursor);
  }

  console.log("Total products fetched:", allProducts.length);
  return {
    products: allProducts,
    pageInfo: { hasNextPage: false, endCursor: cursor },
  };
};

export default function DataFetching() {
  const { products } = useLoaderData();
  const rows = products.map((product) => [
    product.node.title,
    product.node.createdAt,
    product.node.variants.edges.map((variant) => variant.node.title).join(", "),
  ]);

  return (
    <Page>
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <DataTable
                  columnContentTypes={["text", "text", "text"]}
                  headings={["Title", "Created", "Variants"]}
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
