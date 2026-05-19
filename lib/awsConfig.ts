import { fromIni } from "@aws-sdk/credential-providers";

export function getAwsClientConfig() {
  const region = process.env.APP_AWS_REGION || "us-east-2";
  const profile = process.env.APP_AWS_PROFILE?.trim();
  const accessKeyId = process.env.APP_AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.APP_AWS_SECRET_ACCESS_KEY?.trim();
  const sessionToken = process.env.APP_AWS_SESSION_TOKEN?.trim();

  if (profile) {
    return {
      region,
      credentials: fromIni({ profile }),
    };
  }

  if (accessKeyId && secretAccessKey) {
    return {
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
        ...(sessionToken ? { sessionToken } : {}),
      },
    };
  }

  return { region };
}
