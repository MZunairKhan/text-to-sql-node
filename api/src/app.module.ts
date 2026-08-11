import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { SchemaRetrievalModule } from './schema-retrieval/schema-retrieval.module';

@Module({
  imports: [
    HealthModule,
    SchemaRetrievalModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
