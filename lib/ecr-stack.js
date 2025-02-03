const { Stack, CfnOutput, RemovalPolicy, Tags } = require('aws-cdk-lib');
const ecr = require('aws-cdk-lib/aws-ecr');
const iam = require('aws-cdk-lib/aws-iam');

class EcrStack extends Stack {
  /**
   *
   * @param {Construct} scope
   * @param {string} id
   * @param {StackProps=} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);

    // Add a tag to all constructs in the stack
    Tags.of(this).add('stack', 'EcrStack');
    Tags.of(this).add('app', 'sherpaz-bi');

    // Crete ECR repo
    let ecrRepository = new ecr.Repository(this, 'DemoLambdaRepo', {
      repositoryName: process.env.ECR_REPOSITORY_NAME, 
      removalPolicy: RemovalPolicy.DESTROY,
      lifecycleRules: [
        {
          description: 'Mantieni solo le ultime 5 immagini',
          maxImageCount: 5,
        },
      ],
      emptyOnDelete: true, // Remove all images when the repository is deleted
    });

    new CfnOutput(this, 'EcrRepositoryName', {
      value: ecrRepository.repositoryName,
      description: 'ECR repository name',
    });
    
    // Create an IAM user for pushing images to the ECR repository
    const iamUser = new iam.User(this, 'EcrPushUser', {
      userName: process.env.ECR_IAM_USERNAME,
    });

    // Add permissions to the IAM user for the created ECR repository
    iamUser.addToPolicy(new iam.PolicyStatement({
      actions: [
        'ecr:BatchCheckLayerAvailability', // Per verificare i layer delle immagini
        'ecr:PutImage', // Per inviare immagini
        'ecr:InitiateLayerUpload', // Per iniziare l'upload di un layer
        'ecr:UploadLayerPart', // Per caricare parti di un layer
        'ecr:CompleteLayerUpload', // Per completare l'upload
      ],
      resources: [ecrRepository.repositoryArn], // Limita l'accesso al repository specifico
    }));

    // Add permissions to the IAM user for ECR authentication
    iamUser.addToPolicy(new iam.PolicyStatement({
      actions: [
        'ecr:GetAuthorizationToken', // Per autenticarsi su ECR
      ],
      resources: "*"
    }));

    // Create an access key for the IAM user
    const accessKey = new iam.CfnAccessKey(this, 'AccessKey', {
      userName: iamUser.userName,
    });

    new CfnOutput(this, 'AccessKeyIdOutput', {
      value: accessKey.ref,
      description: 'Access Key',
    });

    new CfnOutput(this, 'SecretAccessKeyOutput', {
      value: accessKey.attrSecretAccessKey, // Il Secret Access Key
      description: 'Secret Key',
    });
  }
}

module.exports = { EcrStack }
