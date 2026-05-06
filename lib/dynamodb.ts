import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const region = process.env.AWS_REGION || "us-east-2";

const client = new DynamoDBClient({
  region,
});

export const ddbDocClient = DynamoDBDocumentClient.from(client);
