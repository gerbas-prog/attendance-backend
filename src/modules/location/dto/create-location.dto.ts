// src/modules/location/dto/create-location.dto.ts
import { IsString, IsNumber, IsOptional, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLocationDto {
  @ApiProperty({ example: 'Kantor Pusat Jakarta' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'Jl. Sudirman No. 1, Jakarta' })
  @IsString()
  address: string;

  @ApiProperty({ example: -6.2088 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({ example: 106.8456 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @ApiPropertyOptional({ example: 100, description: 'Radius in meters' })
  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(5000)
  radius?: number = 100;
}
