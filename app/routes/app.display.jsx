import { json } from "@remix-run/node";
import {
  Page,
  Layout,
  Card,
  DataTable,
  Box,
  Button,
  Text,
  BlockStack,
} from "@shopify/polaris";
import { useLoaderData } from "@remix-run/react";
import { useState } from "react";
import { authenticate } from "../shopify.server";

// Helper: Returns the bulk query for a given resource type.
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
}`;
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
}`;
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
}`;
    default:
      throw new Error("Unknown resource type");
  }
}

// Helper: Process raw JSONL nodes into records.
function preprocessNodes(rawNodes, resourceType) {
  if (resourceType === "products") {
    const productsMap = {};
    rawNodes.forEach((node) => {
      if (node.id.includes("/Product/") && !node.__parentId) {
        productsMap[node.id] = { ...node, variants: [] };
      } else if (node.__parentId) {
        if (!productsMap[node.__parentId]) {
          productsMap[node.__parentId] = { id: node.__parentId, title: "Unknown", createdAt: "", variants: [] };
        }
        productsMap[node.__parentId].variants.push(node);
      }
    });
    return Object.values(productsMap).map((product) => {
      const variantDetailsArray = product.variants.map(
        (variant) => `id: ${variant.id}, title: ${variant.title}, price: ${variant.price}`
      );
      const embeddingText = `Product: ${product.title}. Created at: ${product.createdAt}. Variants:\n${variantDetailsArray.join("\n")}`;
      return {
        id: product.id,
        title: product.title,
        createdAt: product.createdAt,
        embeddingText,
      };
    });
  } else if (resourceType === "orders") {
    return rawNodes.map((node) => {
      const embeddingText = `Order: ${node.name}. Created at: ${node.createdAt}. Total Price: ${node.totalPriceSet?.shopMoney?.amount || "N/A"}.`;
      return {
        id: node.id,
        title: node.name,
        createdAt: node.createdAt,
        embeddingText,
      };
    });
  } else if (resourceType === "customers") {
    return rawNodes.map((node) => {
      const embeddingText = `Customer: ${node.firstName} ${node.lastName}. Email: ${node.email}. Created at: ${node.createdAt}.`;
      return {
        id: node.id,
        title: `${node.firstName} ${node.lastName}`,
        createdAt: node.createdAt,
        embeddingText,
      };
    });
  }
  return [];
}

// Helper: Runs the bulk operation for a given resource type.
async function runBulkOperationForResource(admin, resourceType) {
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
  console.log(`Bulk operation run response for ${resourceType}:`, bulkResponseJson);
  if (
    bulkResponseJson.data.bulkOperationRunQuery.userErrors &&
    bulkResponseJson.data.bulkOperationRunQuery.userErrors.length > 0
  ) {
    throw new Error(`Bulk operation failed for ${resourceType}`);
  }

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
    console.log(`Polling bulk operation status for ${resourceType}...`);
    const pollResponse = await admin.graphql(pollQuery);
    const pollJson = await pollResponse.json();
    const currentOp = pollJson.data.currentBulkOperation;
    console.log(`Current bulk operation for ${resourceType}:`, currentOp);
    if (currentOp && currentOp.status === "COMPLETED") {
      bulkOperationUrl = currentOp.url;
      break;
    } else if (currentOp && currentOp.status === "FAILED") {
      throw new Error(`Bulk operation failed for ${resourceType}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  console.log(`Bulk operation for ${resourceType} completed. URL:`, bulkOperationUrl);

  const resultResponse = await fetch(bulkOperationUrl);
  const resultText = await resultResponse.text();
  const lines = resultText.split("\n").filter((line) => line.trim() !== "");
  const rawNodes = lines.map((line) => JSON.parse(line));
  console.log(`Total raw nodes fetched for ${resourceType}:`, rawNodes.length);

  const records = preprocessNodes(rawNodes, resourceType);
  console.log(`Preprocessed records for ${resourceType}:`, records);
  return records;
}

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const resourcesParam = url.searchParams.get("resources");
  const resourceTypes = resourcesParam ? resourcesParam.split(",") : [];

  const results = {};
  for (const resourceType of resourceTypes) {
    try {
      results[resourceType] = await runBulkOperationForResource(admin, resourceType);
    } catch (error) {
      results[resourceType] = { error: error.message };
    }
  }

  return json({ results, resourceTypes });
};

function ResourceResultsCard({ resource, records }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [isExpanded, setIsExpanded] = useState(true);

  // Toggle "select all" checkbox.
  const toggleSelectAll = () => {
    if (selectedIds.length === records.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(records.map((record) => record.id));
    }
  };

  // Toggle individual selection.
  const toggleSelection = (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((selected) => selected !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  // Build table rows with an export checkbox column.
  const rows = records.map((record) => [
    <input
      type="checkbox"
      checked={selectedIds.includes(record.id)}
      onChange={() => toggleSelection(record.id)}
    />,
    record.title,
    record.createdAt,
    <BlockStack vertical>
      {record.embeddingText.split("\n").map((line, index) => (
        <div key={index}>{line}</div>
      ))}
    </BlockStack>,
  ]);

  const headings = [
    <input
      type="checkbox"
      checked={selectedIds.length === records.length && records.length > 0}
      onChange={toggleSelectAll}
    />,
    "Title",
    "Created",
    "Embedding Text",
  ];

  // Handler for the export button.
  const handleExport = (e) => {
    e.stopPropagation();
    console.log("Exporting records with IDs:", selectedIds);
    alert(`Exporting selected IDs: ${selectedIds.join(", ")}`);
  };

  return (
    <Box border="base" padding="4" margin="4" background="surface">
      {/* Sibling 1: Header */}
      <Box 
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", background: "white", borderRadius: "var(--p-border-radius-200)",bordercolor:"black" ,boxshadow:"var(--p-shadow-bevel-100)", padding: "var(--p-space-500)", marginBottom: "var(--p-space-200)", marginTop:"var(--p-space-200)"  
          
          
         }}
        >
        <Text as="h2" variant="headingMd">
          {resource.charAt(0).toUpperCase() + resource.slice(1)}
        </Text>
      </Box>
      {/* Sibling 2: Content */}
      {isExpanded && (
        <div style={{ marginTop: "1rem" }}>
          <div style={{ textAlign: "right", marginBottom: "1rem" }}>
            <Button onClick={(e) => { e.stopPropagation(); handleExport(e); }}>
              Export Selected
            </Button>
          </div>
          <DataTable
            columnContentTypes={["text", "text", "text", "text"]}
            headings={headings}
            rows={rows}
          />
        </div>
      )}
    </Box>
  );
}

export default function DisplayBulkResults() {
  const { results, resourceTypes } = useLoaderData();
  return (
    <Page title="Bulk Operation Results">
      <Layout>
        <Layout.Section>
          {resourceTypes.map((resource) => (
            <ResourceResultsCard
              key={resource}
              resource={resource}
              records={results[resource].error ? [] : results[resource]}
            />
          ))}
        </Layout.Section>
      </Layout>
    </Page>
  );
}
