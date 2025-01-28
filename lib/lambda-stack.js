const { Stack, CfnOutput } = require('aws-cdk-lib');
const lambda = require('aws-cdk-lib/aws-lambda');
const ecr = require('aws-cdk-lib/aws-ecr');

class LambdaStack extends Stack {
  /**
   *
   * @param {Construct} scope
   * @param {string} id
   * @param {StackProps=} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);

    // Recupera il repository ECR esistente
    const ecrRepository = ecr.Repository.fromRepositoryName(this, 'LambdaEcrRepo', process.env.ECR_REPOSITORY_NAME);

    // Crea una Lambda basata su Docker
    const lambdaFunction = new lambda.Function(this, 'MockPythonLambda', {
      code: lambda.Code.fromEcrImage(ecrRepository, {
        tagOrDigest: 'latest', // Specifica il tag dell'immagine Docker
      }),
      handler: lambda.Handler.FROM_IMAGE, // Indica che il codice viene da un'immagine
      runtime: lambda.Runtime.FROM_IMAGE, // Indica che usa un runtime Docker
    });

    // Aggiungi permessi ECR al ruolo della Lambda
    ecrRepository.grantPull(lambdaFunction.role);
    
    const lambdaFunctionUrl = lambdaFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ["*"],
        allowedHeaders: ["*"],
        allowedMethods: ["*"],
      },
    });

    new CfnOutput(this, "FunctionUrl", {
      value: lambdaFunctionUrl.url,
    });

    // Output dell'ARN della Lambda
    new CfnOutput(this, 'FunctionArn', {
      value: lambdaFunction.functionArn,
    });
    
  }
}

module.exports = { LambdaStack }
