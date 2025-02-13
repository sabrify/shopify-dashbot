import { Button, Page, Layout, Card, Checkbox, TextContainer, BlockStack, InlineStack } from "@shopify/polaris";
import { useState } from "react";
import { useNavigate } from "@remix-run/react";

export default function BulkLanding() {
  const [selectedResources, setSelectedResources] = useState([]);
  const navigate = useNavigate();

  const resources = ["products", "orders", "customers"];

  const handleCheckboxChange = (resource) => {
    if (selectedResources.includes(resource)) {
      setSelectedResources(selectedResources.filter((r) => r !== resource));
    } else {
      setSelectedResources([...selectedResources, resource]);
    }
  };

  const handleSubmit = () => {
    const queryParam = selectedResources.join(",");
    navigate(`/app/display?resources=${encodeURIComponent(queryParam)}`);
  };

  return (
    <Page title="Bulk Operations Landing">
      <Layout>
        <Layout.Section>
          <Card sectioned>
            <BlockStack>
              <p>Select the resource types you want to query:</p>
            </BlockStack>
            <BlockStack>
            <InlineStack>
            {resources.map((resource) => (
              
                
              
              <Checkbox
                key={resource}
                label={resource.charAt(0).toUpperCase() + resource.slice(1)}
                checked={selectedResources.includes(resource)}
                onChange={() => handleCheckboxChange(resource)}
              />
            ))}
            </InlineStack>
            <Button primary onClick={handleSubmit} disabled={selectedResources.length === 0}>
              Generate Bulk Queries
            </Button>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
