const cdk = require("aws-cdk-lib");
const { Stack, custom_resources, Tags } = cdk;
const { CfnComputeEnvironment, CfnJobQueue, CfnJobDefinition } = require("aws-cdk-lib/aws-batch");
const ec2 = require("aws-cdk-lib/aws-ec2");
const ecs = require("aws-cdk-lib/aws-ecs");
const iam = require("aws-cdk-lib/aws-iam");
const s3 = require("aws-cdk-lib/aws-s3");
const { AwsCustomResourcePolicy } = require("aws-cdk-lib/custom-resources");

class BatchStack extends Stack {
    constructor(scope, id, props) {
        super(scope, id, props);

        // Add a tag to all constructs in the stack
        Tags.of(this).add('stack', 'BatchStack');
        Tags.of(this).add('app', 'sherpaz-bi');

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

        const bucket = s3.Bucket.fromBucketName(this, "BatchS3Bucket", process.env.BATCH_JOB_S3_BUCKET_NAME);
        // Allow S3 write access to the task role
        bucket.grantWrite(taskRole);

        // ECS Execution Role
        const executionRole = new iam.Role(this, "BatchExecutionRole", {
            assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonECSTaskExecutionRolePolicy"),
            ],
        });

        // Compute Environment
        const computeEnv = new CfnComputeEnvironment(this, process.env.BATCH_COMPUTE_ENV_NAME, {
            computeEnvironmentName: process.env.BATCH_COMPUTE_ENV_NAME,
            type: "MANAGED",
            computeResources: {
                type: "FARGATE",
                maxvCpus: 4,
                subnets: vpc.privateSubnets.map((subnet) => subnet.subnetId),
                securityGroupIds: [securityGroup.securityGroupId],
            },
            serviceRole: batchServiceRole.roleArn,
            state: "ENABLED",
        });

        // Get the ARN for the ECS cluster that Batch creates
        const batchEcsCluster = new custom_resources.AwsCustomResource(this, 'BatchEcsCluster', {
            policy: custom_resources.AwsCustomResourcePolicy.fromSdkCalls({ resources: AwsCustomResourcePolicy.ANY_RESOURCE }),
            // When `onCreate` is not specified, it defaults to whatever `onUpdate` is
            onUpdate: {
                service: '@aws-sdk/client-batch',
                action: 'DescribeComputeEnvironmentsCommand',
                parameters: {
                    computeEnvironments: [computeEnv.computeEnvironmentArn],
                },
                physicalResourceId: custom_resources.PhysicalResourceId.fromResponse('computeEnvironments.0.ecsClusterArn'),
            },
        });

        // Run `tag-resource` on the cluster
        // new custom_resources.AwsCustomResource(this, 'ComputeEnvironmentResourceTags', {
        //     policy: custom_resources.AwsCustomResourcePolicy.fromSdkCalls({ resources: AwsCustomResourcePolicy.ANY_RESOURCE }),
        //     onUpdate: {
        //         service: '@aws-sdk/client-ecs',
        //         action: 'TagResourceCommand',
        //         parameters: {
        //             resourceArn: batchEcsCluster.getResponseFieldReference('computeEnvironments.0.ecsClusterArn'),
        //             tags: [
        //                 "Key=prj,Value=sherpaz-bi",
        //             ],
        //         },
        //         physicalResourceId: custom_resources.PhysicalResourceId.of('compute-resource-tags'),
        //     },
        // });

        // Run `update-cluster` on the cluster to enable container insights
        new custom_resources.AwsCustomResource(this, 'ComputeEnvironmentResourceInsights', {
            policy: custom_resources.AwsCustomResourcePolicy.fromSdkCalls({ resources: AwsCustomResourcePolicy.ANY_RESOURCE }),
            onUpdate: {
                service: '@aws-sdk/client-ecs',
                action: 'UpdateClusterCommand',
                parameters: {
                    cluster: batchEcsCluster.getResponseFieldReference('computeEnvironments.0.ecsClusterArn'),
                    settings: [
                        {
                            name: 'containerInsights',
                            value: 'enabled'
                        },
                    ],
                },
                physicalResourceId: custom_resources.PhysicalResourceId.of('compute-resource-insights'),
            },
        });

        // Job Queue
        const jobQueue = new CfnJobQueue(this, process.env.BATCH_JOB_QUEUE_NAME, {
            jobQueueName: process.env.BATCH_JOB_QUEUE_NAME,
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
        new CfnJobDefinition(this, "JobDefinition", {
            jobQueue: jobQueue.ref,
            jobDefinitionName: process.env.BATCH_JOB_DEFINITION_NAME,
            type: "container",
            containerProperties: {
                image: '' + process.env.BATCH_JOB_DEFINITION_IMAGE,
                command: [process.env.BATCH_JOB_DEFINITION_IMAGE_COMMAND],
                jobRoleArn: taskRole.roleArn,
                executionRoleArn: executionRole.roleArn,
                environment: [
                    {
                        name: "S3_BUCKET_NAME",
                        value: process.env.BATCH_JOB_S3_BUCKET_NAME,
                    },
                ],
                runtimePlatform: {
                    cpuArchitecture: 'ARM64',
                    operatingSystemFamily: 'LINUX',
                },
                resourceRequirements: [
                    {
                        type: 'VCPU',
                        value: process.env.BATCH_JOB_DEFINITION_VCPUS,
                    },
                    {
                        type: 'MEMORY',
                        value: process.env.BATCH_JOB_DEFINITION_MEMORY,
                    },
                ],
                networkConfiguration: {
                    assignPublicIp: "ENABLED",
                },
            },
            platformCapabilities: ["FARGATE"],
            retryStrategy: {
                attempts: 3,
            },
        });
    }
}

module.exports = { BatchStack };