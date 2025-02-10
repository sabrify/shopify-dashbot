import { BlockStack, Layout, Page, Card, DataTable } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { useLoaderData } from "@remix-run/react";


export const loader = async ({request}) => {
    const { admin } = await authenticate.admin(request);
    
    try {
        const response = await admin.graphql(
            `#graphql
        {
          products(first: 50) {
            edges {
              node {
                id
                title
                createdAt
                variants(first: 5) {
                  edges {
                    node {
                      id
                      title
                    }
                  }
                }
                
              }
            }
          }
        }`,

        );
        const responseJson = await response.json();
        const products = responseJson.data.products.edges
        return {
            products
        }
        

    } catch (error) {
        console.error(error);
    }

    console.log("products:", products);
}

export default function DataFetching(){
    const { products } = useLoaderData();
    const rows = products.map(( product)=>[
        product.node.title,
        product.node.createdAt,
        product.node.variants.edges?.map((variant) => variant.node.title).join(", "),
   ])

    return (
        <Page>
            <BlockStack gap = "500">
                <Layout>
                    <Layout.Section>
                    <Card>
              <BlockStack gap="500">
                <DataTable
                  columnContentTypes={[
                    "text",
                    "text",
                    "text",
                    
                  ]}
                  headings={[
                    "Title",
                    "Created",
                    "Variants",
                    
                    
                  ]}
                  rows={rows}
                />
              </BlockStack>
            </Card>
                    </Layout.Section>
                </Layout>
            </BlockStack>
        </Page>
    )
}