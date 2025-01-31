const cdk = require("aws-cdk-lib");
const { Stack } = cdk;
const { CfnComputeEnvironment, CfnJobQueue, CfnJobDefinition } = require("aws-cdk-lib/aws-batch");
const ec2 = require("aws-cdk-lib/aws-ec2");
const iam = require("aws-cdk-lib/aws-iam");
const s3 = require("aws-cdk-lib/aws-s3");

class BatchStack extends Stack {
    constructor(scope, id, props) {
        super(scope, id, props);

        // VPC
        const vpc = new ec2.Vpc(this, "Vpc", {
            maxAzs: 2,
        });

        // Security Group
        const securityGroup = new ec2.SecurityGroup(this, "BatchSecurityGroup", {
            vpc,
            description: "Security group for AWS Batch",
            allowAllOutbound: true,
        });

        // S3 Bucket
        const bucket = new s3.Bucket(this, "BatchS3Bucket", {
            versioned: true,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
        });

        // IAM Roles
        const batchServiceRole = new iam.Role(this, "BatchServiceRole", {
            assumedBy: new iam.ServicePrincipal("batch.amazonaws.com"),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSBatchServiceRole"),
            ],
        });

        const taskRole = new iam.Role(this, "BatchTaskRole", {
            assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonS3FullAccess"),
            ],
        });

        // Permessi per scrivere su S3
        // bucket.grantWrite(taskRole);⁄

        const executionRole = new iam.Role(this, "BatchExecutionRole", {
            assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonECSTaskExecutionRolePolicy"),
            ],
        });

        // Compute Environment
        const computeEnv = new CfnComputeEnvironment(this, "FargateSpotComputeEnv", {
            computeEnvironmentName: "FargateSpotEnv",
            type: "MANAGED",
            computeResources: {
                // type: "FARGATE_SPOT",
                type: "FARGATE",
                maxvCpus: 64,
                subnets: vpc.privateSubnets.map((subnet) => subnet.subnetId),
                securityGroupIds: [securityGroup.securityGroupId],
            },
            serviceRole: batchServiceRole.roleArn,
        });

        // Job Queue
        const jobQueue = new CfnJobQueue(this, "FargateSpotJobQueue", {
            jobQueueName: "FargateSpotQueue",
            state: "ENABLED",
            priority: 1,
            computeEnvironmentOrder: [
                {
                    order: 1,
                    computeEnvironment: computeEnv.ref,
                },
            ],
        });

        // Job Definition
        new CfnJobDefinition(this, "DockerHubJobDefinition", {
            jobQueue: jobQueue.ref,
            jobDefinitionName: "DockerHubJobDefinition",
            type: "container",
            containerProperties: {
                image: "agrumi/cpuloadgenerator:latest",
                command: ['-c 0 -l 1 -d 60'],
                jobRoleArn: taskRole.roleArn,
                executionRoleArn: executionRole.roleArn,
                environment: [
                    {
                        name: "S3_BUCKET",
                        value: bucket.bucketName,
                    },
                ],
                runtimePlatform : {
                    cpuArchitecture: 'ARM64',
                    operatingSystemFamily: 'LINUX',
                },
                resourceRequirements: [
                    {
                        type: 'VCPU',
                        value: '1',
                    },
                    {
                        type: 'MEMORY',
                        value: '2048',
                    },
                ],
                networkConfiguration: {
                    assignPublicIp: "ENABLED",
                },
            },
            platformCapabilities: ["FARGATE"],
            retryStrategy: {
                attempts: 1,
            },
        });
    }
}

module.exports = { BatchStack };