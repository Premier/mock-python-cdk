#!/usr/bin/env node

const dotenv = require('dotenv');
const path = require('path');
const cdk = require('aws-cdk-lib');
const { EcrStack } = require('../lib/ecr-stack');
const { LambdaStack } = require('../lib/lambda-stack');

// 1. Configure dotenv to read from our `.env` file
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const app = new cdk.App();
new EcrStack(app, 'EcrStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION }
});
new LambdaStack(app, 'LambdaStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION }
});
