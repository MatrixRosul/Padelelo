import { Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { RolesGuard } from './guards/roles.guard';

@Module({
  providers: [Reflector, RolesGuard],
  exports: [RolesGuard],
})
export class CommonModule {}
