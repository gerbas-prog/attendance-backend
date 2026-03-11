import { IsNumber, IsOptional, IsString, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CheckOutDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  accuracy?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  selfieUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
