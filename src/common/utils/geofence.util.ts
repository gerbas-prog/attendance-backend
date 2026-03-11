// src/common/utils/geofence.util.ts
import { Injectable } from '@nestjs/common';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface GeofenceResult {
  isInside: boolean;
  distance: number;  // meters
  accuracy: string;  // 'high' | 'medium' | 'low'
}

@Injectable()
export class GeofenceUtil {
  /**
   * Haversine formula - calculates distance between two GPS coordinates
   * More accurate than simple euclidean distance for GPS coords
   */
  calculateDistance(point1: Coordinates, point2: Coordinates): number {
    const R = 6371000; // Earth radius in meters
    const φ1 = (point1.latitude * Math.PI) / 180;
    const φ2 = (point2.latitude * Math.PI) / 180;
    const Δφ = ((point2.latitude - point1.latitude) * Math.PI) / 180;
    const Δλ = ((point2.longitude - point1.longitude) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c); // distance in meters, rounded
  }

  /**
   * Check if a coordinate is within a geofenced area
   */
  isInsideGeofence(
    userCoords: Coordinates,
    locationCenter: Coordinates,
    radiusMeters: number,
    gpsAccuracy?: number,
  ): GeofenceResult {
    const distance = this.calculateDistance(userCoords, locationCenter);

    // If GPS accuracy is provided, add tolerance
    // Example: if accuracy is 20m, the real position could be 20m off
    const effectiveRadius = gpsAccuracy
      ? radiusMeters + Math.min(gpsAccuracy * 0.5, 30) // max 30m tolerance
      : radiusMeters;

    const isInside = distance <= effectiveRadius;

    // Determine accuracy level based on GPS accuracy
    let accuracy: string;
    if (!gpsAccuracy || gpsAccuracy <= 10) accuracy = 'high';
    else if (gpsAccuracy <= 30) accuracy = 'medium';
    else accuracy = 'low';

    return { isInside, distance, accuracy };
  }

  /**
   * Detect if coordinates seem spoofed (mock GPS)
   * Checks for suspicious patterns
   */
  detectMockLocation(coords: Coordinates, accuracy?: number): {
    isSuspicious: boolean;
    reasons: string[];
  } {
    const reasons: string[] = [];

    // Check for unrealistically perfect coordinates (exactly round numbers)
    const latDecimals = (coords.latitude.toString().split('.')[1] || '').length;
    const lngDecimals = (coords.longitude.toString().split('.')[1] || '').length;
    if (latDecimals <= 2 || lngDecimals <= 2) {
      reasons.push('Coordinates have suspiciously few decimal places');
    }

    // Check for unrealistically high accuracy
    if (accuracy !== undefined && accuracy < 1) {
      reasons.push('GPS accuracy is unrealistically high (<1m)');
    }

    // Check for impossible coordinates
    if (Math.abs(coords.latitude) > 90 || Math.abs(coords.longitude) > 180) {
      reasons.push('Coordinates are out of valid range');
    }

    return {
      isSuspicious: reasons.length > 0,
      reasons,
    };
  }

  /**
   * Find the nearest location from a list
   */
  findNearestLocation<T extends { latitude: number; longitude: number; radius: number }>(
    userCoords: Coordinates,
    locations: T[],
  ): { location: T; distance: number; isInside: boolean } | null {
    if (!locations.length) return null;

    let nearest: T = locations[0];
    let minDistance = this.calculateDistance(userCoords, locations[0]);

    for (const loc of locations.slice(1)) {
      const dist = this.calculateDistance(userCoords, loc);
      if (dist < minDistance) {
        minDistance = dist;
        nearest = loc;
      }
    }

    return {
      location: nearest,
      distance: minDistance,
      isInside: minDistance <= nearest.radius,
    };
  }

  /**
   * Convert bearing to compass direction
   */
  getBearing(start: Coordinates, end: Coordinates): string {
    const dLon = ((end.longitude - start.longitude) * Math.PI) / 180;
    const lat1 = (start.latitude * Math.PI) / 180;
    const lat2 = (end.latitude * Math.PI) / 180;

    const y = Math.sin(dLon) * Math.cos(lat2);
    const x =
      Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

    const bearing = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;

    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return directions[Math.round(bearing / 45) % 8];
  }
}
