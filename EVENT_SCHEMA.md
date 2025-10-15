# Event Schema - Rental Booking System

## Overview
Proofsy records every critical step of property rental process to Numbers Protocol Mainnet blockchain using ERC-7053 standard. All events are immutably stored with blockchain proof (NID + Transaction Hash).

## Complete Rental Workflow (7 Steps)

### Role-Based Event Flow
1. **Create Booking** (Landlord) → `BookingCreated`
2. **Confirm Check-In** (Tenant) → `CheckInConfirmed`  
3. **Approve Check-In** (Landlord) → `CheckInConfirmed`
4. **Report Issue** (Tenant) → `InspectionLogged`
5. **Log Inspection** (Landlord) → `InspectionLogged`
6. **Request Check-Out** (Tenant) → `CheckOutConfirmed`
7. **Approve Check-Out** (Landlord) → `CheckOutConfirmed`

---

## Landlord Events

### 1. BookingCreated (Landlord Only)
**Creates initial booking record on blockchain**

```json
{
  "eventType": "BookingCreated",
  "bookingId": "booking_001",
  "propertyId": "prop_downtown_001",
  "actor": "0x51130dB91B91377A24d6Ebeb2a5fC02748b53ce1",
  "occurredAt": "2025-10-14T10:00:00Z",
  "metadata": {
    "propertyId": "prop_downtown_001",
    "propertyName": "Downtown Apartment A1",
    "propertyAddress": "123 Main Street, Jakarta",
    "renterName": "Alice Chen",
    "renterContact": "alice@example.com",
    "startDate": "2025-10-15",
    "endDate": "2025-10-20",
    "rentalPrice": "1500",
    "depositAmount": "500",
    "currency": "USDC",
    "bookingStatus": "confirmed",
    "photosAttached": ["nid1234", "nid5678"]
  }
}
```

### 2. CheckInConfirmed (Landlord - Approval)
**Landlord approves tenant check-in**

```json
{
  "eventType": "CheckInConfirmed",
  "bookingId": "booking_001",
  "propertyId": "prop_downtown_001",
  "actor": "0x51130dB91B91377A24d6Ebeb2a5fC02748b53ce1",
  "occurredAt": "2025-10-15T14:00:00Z",
  "metadata": {
    "propertyId": "prop_downtown_001",
    "keysHandedBy": "John (Landlord Agent)",
    "keysReceived": "yes",
    "propertyCondition": "excellent",
    "waterElectricityMeter": "Water: 1234 kWh, Electric: 5678 kWh",
    "initialPhotos": ["nid_checkin_001", "nid_checkin_002"],
    "approvedBy": "landlord",
    "notes": "All facilities working properly"
  }
}
```

### 3. InspectionLogged (Landlord)
**Landlord logs periodic inspection or maintenance**

```json
{
  "eventType": "InspectionLogged",
  "bookingId": "booking_001",
  "propertyId": "prop_downtown_001",
  "actor": "0x51130dB91B91377A24d6Ebeb2a5fC02748b53ce1",
  "occurredAt": "2025-10-17T10:00:00Z",
  "metadata": {
    "propertyId": "prop_downtown_001",
    "inspectionType": "scheduled_maintenance",
    "overallCondition": "good",
    "issues": "Minor: AC filter needs cleaning",
    "actionTaken": "Scheduled cleaning for tomorrow",
    "photosAttached": ["nid_inspect_001"],
    "inspectedBy": "landlord",
    "nextInspectionDate": "2025-10-19"
  }
}
```

### 4. CheckOutConfirmed (Landlord - Approval)
**Landlord approves tenant check-out**

```json
{
  "eventType": "CheckOutConfirmed",
  "bookingId": "booking_001",
  "propertyId": "prop_downtown_001",
  "actor": "0x51130dB91B91377A24d6Ebeb2a5fC02748b53ce1",
  "occurredAt": "2025-10-20T11:00:00Z",
  "metadata": {
    "propertyId": "prop_downtown_001",
    "keysReturned": "yes",
    "finalCondition": "excellent",
    "damageFound": "none",
    "depositStatus": "fully_returned",
    "depositAmount": "500 USDC",
    "finalPhotos": ["nid_checkout_001", "nid_checkout_002"],
    "approvedBy": "landlord",
    "finalNotes": "Property returned in perfect condition"
  }
}
```

---

## Tenant Events

### 1. CheckInConfirmed (Tenant)
**Tenant confirms check-in received**

```json
{
  "eventType": "CheckInConfirmed",
  "bookingId": "booking_001",
  "propertyId": "prop_downtown_001",
  "actor": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEa0",
  "occurredAt": "2025-10-15T14:30:00Z",
  "metadata": {
    "propertyId": "prop_downtown_001",
    "keysReceived": "yes",
    "propertyCondition": "excellent",
    "initialInspectionNotes": "Everything looks perfect",
    "photosAttached": ["nid_tenant_checkin_001"],
    "confirmedBy": "tenant",
    "timestamp": "2025-10-15T14:30:00Z"
  }
}
```

### 2. InspectionLogged (Tenant - Issue Report)
**Tenant reports issue or damage**

```json
{
  "eventType": "InspectionLogged",
  "bookingId": "booking_001",
  "propertyId": "prop_downtown_001",
  "actor": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEa0",
  "occurredAt": "2025-10-16T09:00:00Z",
  "metadata": {
    "propertyId": "prop_downtown_001",
    "issueType": "maintenance_request",
    "issueDescription": "Bathroom sink drain is slow",
    "urgencyLevel": "medium",
    "photosAttached": ["nid_issue_001"],
    "reportedBy": "tenant",
    "requestedAction": "Please send plumber",
    "timestamp": "2025-10-16T09:00:00Z"
  }
}
```

### 3. CheckOutConfirmed (Tenant - Request)
**Tenant requests check-out**

```json
{
  "eventType": "CheckOutConfirmed",
  "bookingId": "booking_001",
  "propertyId": "prop_downtown_001",
  "actor": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEa0",
  "occurredAt": "2025-10-20T10:00:00Z",
  "metadata": {
    "propertyId": "prop_downtown_001",
    "keysReadyToReturn": "yes",
    "propertyCondition": "clean_and_ready",
    "checkoutPhotos": ["nid_tenant_checkout_001"],
    "requestedBy": "tenant",
    "notes": "Cleaned all areas, ready for inspection",
    "timestamp": "2025-10-20T10:00:00Z"
  }
}
```

---

## Metadata Structure Rules

### Fixed Keys Architecture
- **All metadata keys are HARDCODED** per event type
- Only **values** are dynamic (user input)
- Ensures consistent blockchain verification
- Role-based templates (Landlord vs Tenant have different fields)

### Photo Integration
- Photos uploaded first → generates NID
- NIDs embedded in event metadata (`photosAttached` field)
- Each photo has: NID, transaction hash, proof URL
- Thumbnails displayed in timeline with lightbox viewer

## Capture API Integration

### Commit Event
Every event is sent to Numbers Mainnet via Capture API with format:
```json
{
  "data": {
    "eventType": "BookingCreated",
    "bookingId": "book_demo_1",
    "propertyId": "prop_A",
    "actor": "0xabc",
    "occurredAt": "2025-10-15T01:00:00Z",
    "metadata": {...},
    "idempotencyKey": "unique_key"
  },
  "source": {
    "id": "booking-book_demo_1",
    "name": "Rental Booking System"
  }
}
```

### Response Format
```json
{
  "txHash": "0x123...abc",
  "nid": "nid_123456789",
  "status": "committed"
}
```

## Timeline Display
Every event will be displayed in timeline with information:
- Event type and timestamp
- Actor (wallet address)
- Relevant metadata
- Blockchain proof (txHash and NID)
- Verification status

