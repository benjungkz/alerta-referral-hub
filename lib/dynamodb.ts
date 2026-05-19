import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { getAwsClientConfig } from "./awsConfig";

const client = new DynamoDBClient(getAwsClientConfig());

export const ddbDocClient = DynamoDBDocumentClient.from(client);
