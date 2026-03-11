import { IsNumber, IsOptional, IsString, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CheckInDto {
  @ApiProperty({ example: -6.2088, description: 'GPS Latitude' })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({ example: 106.8456, description: 'GPS Longitude' })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @ApiPropertyOptional({ example: 10, description: 'GPS accuracy in meters' })
  @IsOptional()
  @IsNumber()
  accuracy?: number;

  @ApiPropertyOptional({ description: 'Selfie photo URL (uploaded separately)' })
  @IsOptional()
  @IsString()
  selfieUrl?: string;

  @ApiPropertyOptional({ example: 'Check in from field location' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ example: 'Samsung Galaxy A52 | Android 13' })
  @IsOptional()
  @IsString()
  deviceInfo?: string;
}
