const { Stack, CfnOutput, RemovalPolicy } = require('aws-cdk-lib');
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

    // Crea un repository ECR
    let ecrRepository = new ecr.Repository(this, 'DemoLambdaRepo', {
      repositoryName: process.env.ECR_REPOSITORY_NAME, // Nome del repository
      removalPolicy: RemovalPolicy.DESTROY, // Cancella il repository al termine dello stack
      lifecycleRules: [
        {
          description: 'Mantieni solo le ultime 5 immagini',
          maxImageCount: 5,
        },
      ],
      autoDeleteImages: true, // Elimina le immagini al termine del repository
      emptyOnDelete: true, // Cancella il repository vuoto
    });

    // Opzionale: Output del nome del repository
    new CfnOutput(this, 'EcrRepositoryName', {
      value: ecrRepository.repositoryName,
      description: 'Nome del repository ECR',
    });
    
    // Creazione utente se non esiste
    const iamUser = new iam.User(this, 'EcrPushUser', {
      userName: process.env.ECR_IAM_USERNAME,
    });

    // Aggiungi permessi per ECR specifici al repository
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

    // Aggiungi permessi per ECR per ottenere l'autorizzazione
    iamUser.addToPolicy(new iam.PolicyStatement({
      actions: [
        'ecr:GetAuthorizationToken', // Per autenticarsi su ECR
      ],
      resources: "*"
    }));

    // Crea una chiave di accesso per l'utente IAM
    const accessKey = new iam.CfnAccessKey(this, 'AccessKey', {
      userName: iamUser.userName,
    });

    // Output dell'Access Key ID e del Secret Access Key
    new CfnOutput(this, 'AccessKeyIdOutput', {
      value: accessKey.ref, // L'Access Key ID
      description: 'Access Key ID per l\'utente IAM',
    });

    new CfnOutput(this, 'SecretAccessKeyOutput', {
      value: accessKey.attrSecretAccessKey, // Il Secret Access Key
      description: 'Secret Access Key per l\'utente IAM',
    });
  }
}

module.exports = { EcrStack }
