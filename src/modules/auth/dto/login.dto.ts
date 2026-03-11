// src/modules/auth/dto/login.dto.ts
import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'ahmad@demo.co.id' })
  @IsEmail({}, { message: 'Format email tidak valid' })
  email: string;

  @ApiProperty({ example: 'Admin@123' })
  @IsString()
  @MinLength(6, { message: 'Password minimal 6 karakter' })
  password: string;
}
