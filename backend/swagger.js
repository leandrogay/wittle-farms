import swaggerJSDoc from 'swagger-jsdoc';

const swaggerDefinition = {
    openapi: '3.0.0',
  info: {
    title: 'Little Farms API Documentation',
    version: '1.0.0',
    description: 'API documentation',
  },
  servers: [
    { url: 'http://localhost:3000', description: 'Local' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
  },
}

export const swaggerSpec = swaggerJSDoc({
    swaggerDefinition,
  apis: ['./routes/*.js', './models/*.js'],
})