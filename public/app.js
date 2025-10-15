// Proofsy - Blockchain Rental Verification App
class ProofsyApp {
    constructor() {
        this.apiBase = window.location.origin;
        this.currentPage = 'landing';
        this.userRole = null;
        this.init();
    }

    init() {
        this.checkSystemStatus();
        this.setupEventForm();
        this.setCurrentDateTime();
        
        // Auto-load demo timeline if on dashboard
        if (this.currentPage === 'dashboard') {
            this.loadTimeline();
        }
    }

    async checkSystemStatus() {
        try {
            const response = await fetch(`${this.apiBase}/api/health`);
            const data = await response.json();
            
            const statusElement = document.getElementById('statusText');
            if (statusElement) {
                statusElement.textContent = data.mode === 'LIVE' ? 'Live' : 'Test';
            }
        } catch (error) {
            console.error('Status check failed:', error);
        }
    }

    setupEventForm() {
        const form = document.getElementById('eventForm');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.submitEvent();
            });
            
            // Update form based on role
            this.updateFormBasedOnRole();
        }
    }
    
    updateFormBasedOnRole() {
        if (!this.userRole) return;
        
        const eventTypeSelect = document.getElementById('eventType');
        if (!eventTypeSelect) return;
        
        // Clear existing options
        eventTypeSelect.innerHTML = '';
        
        if (this.userRole === 'landlord') {
            // Landlord can create bookings and inspections
            eventTypeSelect.innerHTML = `
                <option value="BookingCreated">Create New Booking</option>
                <option value="CheckInConfirmed">Approve Check-In</option>
                <option value="InspectionLogged">Log Inspection</option>
                <option value="CheckOutConfirmed">Approve Check-Out</option>
            `;
        } else if (this.userRole === 'tenant') {
            // Tenant can confirm check-in/out and report issues
            eventTypeSelect.innerHTML = `
                <option value="CheckInConfirmed">Confirm Check-In</option>
                <option value="InspectionLogged">Report Issue</option>
                <option value="CheckOutConfirmed">Request Check-Out</option>
            `;
        }
    }

    setCurrentDateTime() {
        const input = document.getElementById('occurredAt');
        if (input) {
            const now = new Date();
            const datetime = now.toISOString().slice(0, 16);
            input.value = datetime;
        }
    }

    async submitEvent() {
        const form = document.getElementById('eventForm');
        const submitBtn = form.querySelector('button[type="submit"]');
        const spinner = submitBtn.querySelector('.loading-spinner');
        
        // Validate required fields BEFORE starting submission
        const bookingId = document.getElementById('bookingId').value.trim();
        const propertyId = document.getElementById('propertyId').value.trim();
        const actor = document.getElementById('actor').value.trim();
        const eventType = document.getElementById('eventType').value;
        const metadataText = document.getElementById('metadata').value.trim();
        
        // Check required fields
        if (!bookingId) {
            this.showAlert('danger', '❌ Booking ID is required');
            return;
        }
        if (!propertyId) {
            this.showAlert('danger', '❌ Property ID is required');
            return;
        }
        if (!actor) {
            this.showAlert('danger', '❌ Actor (wallet address) is required');
            return;
        }
        if (!eventType) {
            this.showAlert('danger', '❌ Event Type is required');
            return;
        }
        if (!metadataText || metadataText === '{}') {
            this.showAlert('danger', '❌ Metadata is required (cannot be empty)');
            return;
        }
        
        // Validate wallet address format (basic check)
        if (!actor.startsWith('0x') || actor.length !== 42) {
            this.showAlert('danger', '❌ Invalid wallet address format (must start with 0x and be 42 characters)');
            return;
        }
        
        spinner.classList.add('show');
        submitBtn.disabled = true;

        try {
            // Parse and validate metadata JSON
            let customMetadata;
            try {
                customMetadata = this.parseMetadata(metadataText);
            } catch (parseError) {
                this.showAlert('danger', `❌ ${parseError.message}`);
                spinner.classList.remove('show');
                submitBtn.disabled = false;
                return;
            }
            
            // Step 1: Upload photos FIRST and get their NIDs
            let photoEvidence = [];
            const photoInput = document.getElementById('eventPhotos');
            if (photoInput && photoInput.files.length > 0) {
                const photoResults = await this.uploadEventPhotos(bookingId, photoInput.files);
                photoEvidence = photoResults.photoEvidence;
                
                // If all photos failed, show error and stop
                if (photoResults.errorCount > 0 && photoResults.uploadCount === 0) {
                    this.showAlert('danger', `❌ All ${photoResults.errorCount} photo(s) failed to upload. Cannot proceed with event submission.`);
                    spinner.classList.remove('show');
                    submitBtn.disabled = false;
                    return;
                }
                
                // Show warning if some photos failed
                if (photoResults.errorCount > 0) {
                    this.showAlert('warning', `⚠️ ${photoResults.errorCount} photo(s) failed to upload. Proceeding with ${photoResults.uploadCount} successful photo(s).`);
                }
            }
            
            // Step 2: Add photo NIDs to event metadata
            const eventData = {
                event: {
                    eventType: document.getElementById('eventType').value,
                    bookingId: bookingId,
                    propertyId: document.getElementById('propertyId').value,
                    actor: document.getElementById('actor').value,
                    occurredAt: new Date(document.getElementById('occurredAt').value).toISOString(),
                    metadata: {
                        ...customMetadata,
                        submittedBy: this.userRole || 'unknown',
                        submittedAt: new Date().toISOString(),
                        photoEvidence: photoEvidence.length > 0 ? photoEvidence : undefined
                    }
                }
            };

            const idempotencyKey = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // Step 3: Submit event with photo references
            const response = await fetch(`${this.apiBase}/api/events`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Idempotency-Key': idempotencyKey
                },
                body: JSON.stringify(eventData)
            });

            const result = await response.json();

            if (response.ok) {
                let successMessage = photoEvidence.length > 0 
                    ? `✅ Event + ${photoEvidence.length} photo(s) submitted to blockchain with linked references!`
                    : '✅ Event submitted to blockchain successfully!';
                
                this.showAlert('success', successMessage);
                
                // Auto-load timeline with the booking ID
                const bookingInput = document.getElementById('timelineBookingId');
                if (bookingInput) {
                    bookingInput.value = eventData.event.bookingId;
                }
                
                setTimeout(() => {
                    this.loadTimeline();
                }, 1000);
                
                form.reset();
                this.setCurrentDateTime();
                
                // Clear photo preview
                const preview = document.getElementById('eventMediaPreview');
                const previewContainer = document.getElementById('eventPreviewContainer');
                if (preview) preview.style.display = 'none';
                if (previewContainer) previewContainer.innerHTML = '';
            } else {
                this.showAlert('danger', `❌ Error: ${result.error}`);
            }
        } catch (error) {
            this.showAlert('danger', `❌ Network error: ${error.message}`);
        } finally {
            spinner.classList.remove('show');
            submitBtn.disabled = false;
        }
    }

    async uploadEventPhotos(bookingId, files) {
        const userRole = this.userRole;
        let uploadCount = 0;
        let errorCount = 0;
        let photoEvidence = [];
        
        for (const file of files) {
            const formData = new FormData();
            formData.append('media', file);
            formData.append('bookingId', bookingId);
            formData.append('uploadedBy', userRole || 'user');
            
            try {
                const response = await fetch(`${this.apiBase}/api/media/upload`, {
                    method: 'POST',
                    body: formData
                });
                
                if (response.ok) {
                    const result = await response.json();
                    uploadCount++;
                    
                    // Collect photo NID and metadata for event reference
                    if (result.blockchain && result.blockchain.nid) {
                        photoEvidence.push({
                            nid: result.blockchain.nid,
                            fileName: file.name,
                            photoUrl: result.file.url, // Photo URL for display
                            uploadedBy: userRole || 'user',
                            uploadedAt: new Date().toISOString(),
                            verifyUrl: `https://verify.numbersprotocol.io/asset-profile/${result.blockchain.nid}`
                        });
                    }
                } else {
                    errorCount++;
                    console.error(`Photo upload failed for ${file.name}:`, response.statusText);
                }
            } catch (error) {
                errorCount++;
                console.error('Photo upload error:', error);
            }
        }
        
        // Return results with photo NIDs for event metadata
        return { uploadCount, errorCount, photoEvidence };
    }

    parseMetadata(metadataText) {
        try {
            if (!metadataText.trim()) {
                throw new Error('Metadata cannot be empty');
            }
            const parsed = JSON.parse(metadataText);
            
            // Ensure it's an object and not null/array
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                throw new Error('Metadata must be a valid JSON object');
            }
            
            return parsed;
        } catch (error) {
            // Re-throw with clear message
            if (error instanceof SyntaxError) {
                throw new Error('Invalid JSON format in metadata field');
            }
            throw error;
        }
    }

    async loadTimeline() {
        const bookingIdInput = document.getElementById('timelineBookingId');
        const bookingId = bookingIdInput ? bookingIdInput.value : 'demo_rental_2025';
        
        if (!bookingId) {
            this.showAlert('warning', 'Please enter a booking ID');
            return;
        }
        
        try {
            const response = await fetch(`${this.apiBase}/api/events?bookingId=${bookingId}`);
            const data = await response.json();
            
            this.renderTimeline(data);
        } catch (error) {
            this.renderTimeline({ bookingId, events: [] });
        }
    }

    renderTimeline(data) {
        const container = document.getElementById('timelineContainer');
        if (!container) return;
        
        if (!data.events || data.events.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-5">
                    <i class="fas fa-inbox fa-3x mb-3 opacity-50"></i>
                    <p>No events found for booking: <strong>${data.bookingId}</strong></p>
                    <small>Create an event to see it here</small>
                </div>
            `;
            return;
        }

        const sortedEvents = data.events.sort((a, b) => 
            new Date(a.occurredAt) - new Date(b.occurredAt)
        );
        
        const timelineHtml = `
            <div class="timeline">
                ${sortedEvents.map(event => this.renderEventCard(event)).join('')}
            </div>
        `;
        
        container.innerHTML = timelineHtml;
        
        // Attach event listeners to "Use This Booking" buttons
        this.attachBookingButtonListeners();
    }
    
    attachBookingButtonListeners() {
        const buttons = document.querySelectorAll('.use-booking-btn');
        console.log(`Found ${buttons.length} booking buttons to attach listeners`);
        
        buttons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const btn = e.currentTarget;
                const bookingId = btn.dataset.bookingId;
                const propertyId = btn.dataset.propertyId;
                const metadataEncoded = btn.dataset.metadata;
                
                console.log('Button clicked:', { bookingId, propertyId, metadataEncoded: metadataEncoded?.substring(0, 50) });
                
                let metadata = {};
                try {
                    if (metadataEncoded) {
                        metadata = JSON.parse(decodeURIComponent(metadataEncoded));
                    }
                } catch (err) {
                    console.error('Failed to parse metadata:', err);
                }
                
                window.useThisBooking(bookingId, propertyId, metadata);
            });
        });
    }

    renderEventCard(event) {
        const eventTypeClass = event.eventType.toLowerCase().replace(/[^a-z]/g, '');
        const status = event.captureTxHash ? 'completed' : 'pending';
        const occurredDate = new Date(event.occurredAt).toLocaleString();
        const receivedDate = new Date(event.receivedAt).toLocaleString();

        return `
            <div class="timeline-item ${status}">
                <div class="card event-card ${eventTypeClass}">
                    <div class="d-flex justify-content-between align-items-start mb-3">
                        <div>
                            <h6 class="fw-bold mb-1">
                                <i class="fas ${this.getEventIcon(event.eventType)} me-2"></i>
                                ${this.getEventDisplayName(event.eventType)}
                            </h6>
                            <small class="text-muted">
                                <i class="fas fa-calendar me-1"></i>
                                ${occurredDate}
                            </small>
                        </div>
                        <span class="badge bg-${status === 'completed' ? 'success' : 'warning'}">
                            ${status}
                        </span>
                    </div>
                    
                    <div class="mb-3">
                        <small class="text-muted">
                            <i class="fas fa-user me-1"></i>
                            <strong>Actor:</strong> ${event.actor}
                        </small>
                    </div>

                    ${event.metadata && Object.keys(event.metadata).length > 0 ? `
                        <div class="metadata-section">
                            <h6 class="fw-bold mb-2">
                                <i class="fas fa-info-circle me-2"></i>Event Details
                            </h6>
                            ${this.renderMetadata(event.metadata)}
                        </div>
                    ` : ''}

                    ${event.metadata && event.metadata.photoEvidence && event.metadata.photoEvidence.length > 0 ? `
                        <div class="photo-evidence-section mt-3">
                            <h6 class="fw-bold mb-3">
                                <i class="fas fa-camera me-2"></i>Photo Evidence
                                <span class="badge bg-primary ms-2">${event.metadata.photoEvidence.length}</span>
                            </h6>
                            ${this.renderPhotoEvidence(event.metadata.photoEvidence)}
                        </div>
                    ` : ''}

                    ${event.captureTxHash && event.captureNid ? `
                        <div class="blockchain-proof">
                            <h6 class="fw-bold mb-3">
                                <i class="fas fa-link me-2"></i>Blockchain Proof
                            </h6>
                            
                            <!-- Primary Verification: NID -->
                            <div class="mb-3 p-3" style="background: var(--gray-800); border: 1px solid var(--gray-700); border-radius: 6px;">
                                <div class="d-flex align-items-center mb-2">
                                    <i class="fas fa-certificate text-white me-2"></i>
                                    <strong>Asset NID (Primary Identifier)</strong>
                                </div>
                                <div class="hash-display mb-2" style="font-size: 0.875rem;">${event.captureNid}</div>
                                ${event.links && event.links.asset ? `
                                    <a href="${event.links.asset}" target="_blank" class="btn btn-sm btn-outline-light">
                                        <i class="fas fa-external-link-alt me-1"></i>Verify on Numbers Protocol
                                    </a>
                                ` : ''}
                                <p class="mt-2 mb-0" style="font-size: 0.75rem; color: var(--gray-400);">
                                    <i class="fas fa-info-circle me-1"></i>
                                    Copy this NID to verify event authenticity on Numbers Protocol explorer
                                </p>
                            </div>
                            
                            <!-- Workflow ID (Not Real TX Hash) -->
                            <div class="p-3" style="background: var(--gray-900); border: 1px solid var(--gray-700); border-radius: 6px;">
                                <div class="d-flex align-items-center mb-2">
                                    <i class="fas fa-clock text-warning me-2"></i>
                                    <strong>Workflow ID</strong>
                                    <span class="badge bg-warning text-dark ms-2" style="font-size: 0.7rem;">Not blockchain TX</span>
                                </div>
                                <div class="hash-display mb-2" style="font-size: 0.875rem;">${event.captureTxHash}</div>
                                <p class="mb-0" style="font-size: 0.75rem; color: var(--gray-400);">
                                    <i class="fas fa-exclamation-triangle me-1"></i>
                                    This is a workflow reference ID, not the actual blockchain transaction hash. 
                                    Real TX hash (0x...) will be available after async blockchain commit completes.
                                    <strong>Use NID above for verification.</strong>
                                </p>
                            </div>
                            <div class="mt-3">
                                <small class="text-muted">
                                    <i class="fas fa-clock me-1"></i>
                                    Recorded: ${receivedDate}
                                </small>
                            </div>
                        </div>
                    ` : `
                        <div class="alert alert-warning mb-0 mt-3">
                            <i class="fas fa-hourglass-half me-2"></i>
                            Event pending blockchain confirmation...
                        </div>
                    `}
                    
                    <!-- Use This Booking Button -->
                    <div class="mt-3 pt-3" style="border-top: 1px solid var(--gray-700);">
                        <button 
                            class="btn btn-outline-primary btn-sm w-100 use-booking-btn" 
                            data-booking-id="${event.bookingId}"
                            data-property-id="${event.propertyId}"
                            data-metadata="${encodeURIComponent(JSON.stringify(event.metadata || {}))}"
                            style="border-color: var(--gray-600); color: #fff;">
                            <i class="fas fa-magic me-2"></i>Use This Booking
                        </button>
                        <small class="text-muted d-block text-center mt-2" style="font-size: 0.7rem;">
                            Auto-populate form with booking details
                        </small>
                    </div>
                </div>
            </div>
        `;
    }

    renderMetadata(metadata) {
        if (Array.isArray(metadata)) {
            return `
                <ul class="list-unstyled mb-0">
                    ${metadata.map(item => `
                        <li class="mb-1">
                            <i class="fas fa-check-circle text-success me-2"></i>
                            ${JSON.stringify(item)}
                        </li>
                    `).join('')}
                </ul>
            `;
        }
        
        return Object.entries(metadata)
            .filter(([key]) => key !== 'photoEvidence') // Don't show photoEvidence here, it has its own section
            .map(([key, value]) => {
                if (typeof value === 'object') {
                    return `
                        <div class="mb-2">
                            <strong>${this.formatKey(key)}:</strong>
                            <pre class="bg-light p-2 rounded mt-1 mb-0">${JSON.stringify(value, null, 2)}</pre>
                        </div>
                    `;
                }
                return `
                    <div class="mb-1">
                        <strong>${this.formatKey(key)}:</strong> ${value}
                    </div>
                `;
            }).join('');
    }

    renderPhotoEvidence(photoEvidence) {
        return `
            <div class="photo-grid">
                ${photoEvidence.map((photo, index) => `
                    <div class="photo-card" style="background: var(--gray-800); border: 1px solid var(--gray-700); border-radius: 8px; padding: 12px; margin-bottom: 12px;">
                        <!-- Photo Thumbnail -->
                        ${photo.photoUrl ? `
                            <div class="photo-thumbnail-container mb-3" style="position: relative; cursor: pointer; border-radius: 8px; overflow: hidden;" 
                                 onclick="window.app.openPhotoLightbox('${photo.photoUrl.replace(/'/g, "\\'")}', '${photo.fileName.replace(/'/g, "\\'")}', '${photo.uploadedBy.replace(/'/g, "\\'")}', '${photo.uploadedAt}', '${photo.nid}', '${photo.verifyUrl}')">
                                <img src="${photo.photoUrl}" 
                                     alt="${photo.fileName}" 
                                     class="photo-thumbnail"
                                     style="width: 100%; height: 200px; object-fit: cover; display: block;"
                                     onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22%3E%3Crect width=%22200%22 height=%22200%22 fill=%22%23333%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23999%22 font-family=%22Arial%22 font-size=%2214%22%3EPhoto Unavailable%3C/text%3E%3C/svg%3E'; this.style.objectFit='contain';">
                                <div class="photo-overlay" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); opacity: 0; transition: opacity 0.2s; display: flex; align-items: center; justify-content: center;">
                                    <i class="fas fa-search-plus" style="color: white; font-size: 2rem;"></i>
                                </div>
                            </div>
                        ` : `
                            <div class="photo-placeholder mb-3" style="background: var(--gray-900); border: 2px dashed var(--gray-700); border-radius: 8px; height: 200px; display: flex; align-items: center; justify-content: center;">
                                <div class="text-center" style="color: var(--gray-500);">
                                    <i class="fas fa-image fa-3x mb-2"></i>
                                    <p class="mb-0" style="font-size: 0.85rem;">Photo not available</p>
                                </div>
                            </div>
                        `}
                        
                        <!-- Photo Info -->
                        <div class="d-flex align-items-start justify-content-between mb-2">
                            <div class="flex-grow-1">
                                <div class="d-flex align-items-center mb-1">
                                    <i class="fas fa-image text-primary me-2"></i>
                                    <strong style="font-size: 0.9rem;">${photo.fileName || `Photo ${index + 1}`}</strong>
                                </div>
                                <div style="font-size: 0.75rem; color: var(--gray-400);">
                                    <i class="fas fa-user me-1"></i>by ${photo.uploadedBy || 'unknown'}
                                    ${photo.uploadedAt ? `
                                        <span class="ms-2">
                                            <i class="fas fa-clock me-1"></i>${new Date(photo.uploadedAt).toLocaleString()}
                                        </span>
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                        
                        <!-- Photo NID -->
                        <div class="mb-2" style="background: var(--gray-900); padding: 8px; border-radius: 4px;">
                            <div style="font-size: 0.7rem; color: var(--gray-400); margin-bottom: 4px;">Photo NID:</div>
                            <div class="hash-display" style="font-size: 0.75rem; font-family: 'Courier New', monospace; word-break: break-all; color: var(--gray-300);">
                                ${photo.nid}
                            </div>
                        </div>
                        
                        <!-- Action Buttons -->
                        <div class="d-flex gap-2">
                            ${photo.photoUrl ? `
                                <a href="${photo.photoUrl}" 
                                   download="${photo.fileName}"
                                   class="btn btn-sm btn-outline-secondary flex-grow-1"
                                   style="border-color: var(--gray-600); color: var(--gray-300);">
                                    <i class="fas fa-download me-1"></i>Download
                                </a>
                            ` : ''}
                            <a href="${photo.verifyUrl || `https://verify.numbersprotocol.io/asset-profile/${photo.nid}`}" 
                               target="_blank" 
                               class="btn btn-sm btn-outline-primary flex-grow-1"
                               style="border-color: var(--gray-600); color: #fff;">
                                <i class="fas fa-external-link-alt me-1"></i>Verify
                            </a>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    openPhotoLightbox(photoUrl, fileName, uploadedBy, uploadedAt, nid, verifyUrl) {
        const modal = new bootstrap.Modal(document.getElementById('photoLightboxModal'));
        const image = document.getElementById('photoLightboxImage');
        const title = document.getElementById('photoLightboxTitle');
        const info = document.getElementById('photoLightboxInfo');
        const downloadBtn = document.getElementById('photoDownloadBtn');
        const verifyBtn = document.getElementById('photoVerifyBtn');
        
        // Set photo
        image.src = photoUrl;
        title.textContent = fileName;
        
        // Set info
        info.innerHTML = `
            <div class="d-flex justify-content-center gap-4 flex-wrap">
                <div><i class="fas fa-user me-2"></i>Uploaded by: <strong>${uploadedBy}</strong></div>
                <div><i class="fas fa-clock me-2"></i>${new Date(uploadedAt).toLocaleString()}</div>
            </div>
            <div class="mt-2" style="font-size: 0.8rem; color: var(--gray-400);">
                <div>NID: <code style="color: var(--gray-300);">${nid}</code></div>
            </div>
        `;
        
        // Set buttons
        downloadBtn.href = photoUrl;
        downloadBtn.download = fileName;
        verifyBtn.href = verifyUrl;
        
        // Show modal
        modal.show();
    }

    formatKey(key) {
        return key
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase());
    }

    getEventIcon(eventType) {
        const icons = {
            'BookingCreated': 'fa-calendar-check',
            'CheckInConfirmed': 'fa-key',
            'InspectionLogged': 'fa-search',
            'CheckOutConfirmed': 'fa-door-open'
        };
        return icons[eventType] || 'fa-circle';
    }

    getEventDisplayName(eventType) {
        const names = {
            'BookingCreated': 'Booking Created',
            'CheckInConfirmed': 'Check-In Confirmed',
            'InspectionLogged': 'Inspection Logged',
            'CheckOutConfirmed': 'Check-Out Confirmed'
        };
        return names[eventType] || eventType;
    }

    showAlert(type, message) {
        // Find the first container in the current page
        let targetContainer = document.querySelector('#dashboardPage .container-fluid');
        if (!targetContainer) {
            targetContainer = document.querySelector('.container');
        }
        
        if (!targetContainer) return;

        const alertHtml = `
            <div class="alert alert-${type} alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x mt-3" 
                 style="z-index: 9999; min-width: 300px;" role="alert">
                ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        `;
        
        document.querySelectorAll('.alert').forEach(alert => alert.remove());
        document.body.insertAdjacentHTML('beforeend', alertHtml);
        
        setTimeout(() => {
            const alert = document.querySelector('.alert');
            if (alert) {
                const bsAlert = new bootstrap.Alert(alert);
                bsAlert.close();
            }
        }, 5000);
    }
}

// Page Navigation Functions
function showLandingPage() {
    document.getElementById('landingPage').style.display = 'block';
    document.getElementById('authPage').style.display = 'none';
    document.getElementById('dashboardPage').style.display = 'none';
    window.app.currentPage = 'landing';
}

function showAuthPage() {
    document.getElementById('landingPage').style.display = 'none';
    document.getElementById('authPage').style.display = 'block';
    document.getElementById('dashboardPage').style.display = 'none';
    window.app.currentPage = 'auth';
}

function showDashboardPage() {
    document.getElementById('landingPage').style.display = 'none';
    document.getElementById('authPage').style.display = 'none';
    document.getElementById('dashboardPage').style.display = 'block';
    window.app.currentPage = 'dashboard';
    
    // Set default values
    document.getElementById('bookingId').value = `booking_${Date.now()}`;
    document.getElementById('propertyId').value = `prop_${Math.floor(Math.random() * 1000)}`;
    document.getElementById('timelineBookingId').value = 'demo_rental_2025';
    
    // Load demo timeline
    setTimeout(() => window.app.loadTimeline(), 500);
}

function selectRole(role) {
    window.app.userRole = role;
    document.getElementById('userRole').textContent = role.charAt(0).toUpperCase() + role.slice(1);
    showDashboardPage();
    
    // Update form options based on selected role
    setTimeout(() => {
        window.app.updateFormBasedOnRole();
    }, 100);
}

function logout() {
    window.app.userRole = null;
    showLandingPage();
}

function scrollToSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
        section.scrollIntoView({ behavior: 'smooth' });
    }
}

// Metadata Helper Examples - Role-based templates with hardcoded keys
function insertMetadataExample() {
    const helper = document.getElementById('metadataHelper');
    const metadataTextarea = document.getElementById('metadata');
    const eventTypeSelect = document.getElementById('eventType');
    const propertyId = document.getElementById('propertyId').value || `prop_${Math.floor(Math.random() * 1000)}`;
    const userRole = window.app ? window.app.userRole : 'landlord';
    
    // LANDLORD Templates - Fixed keys for each event type
    const landlordTemplates = {
        'BookingCreated': {
            propertyId: propertyId,
            propertyName: "Villa Seminyak Sunset",
            propertyAddress: "123 Modern Street, Bali",
            renterName: "Sarah Johnson",
            renterEmail: "sarah.johnson@email.com",
            rentAmount: 2500,
            currency: "USDC",
            duration: "12 months",
            depositAmount: 5000,
            moveInDate: "2025-11-01",
            moveOutDate: "2026-11-01",
            amenities: ["Parking", "Gym", "Pool", "24/7 Security"]
        },
        'CheckInConfirmed': {
            propertyId: propertyId,
            keysGiven: 2,
            accessCardsGiven: 1,
            approvalStatus: "approved",
            conditionVerified: "excellent",
            approvalNotes: "All keys handed over, tenant confirmed property condition",
            approvedAt: new Date().toISOString(),
            meterReadingsVerified: true,
            initialMeterReadings: {
                electricity: "12458 kWh",
                water: "8932 m³",
                gas: "3421 m³"
            }
        },
        'InspectionLogged': {
            propertyId: propertyId,
            inspectionType: "Regular Maintenance Check",
            inspectionDate: new Date().toISOString(),
            findings: "All systems operational, minor wear on kitchen faucet",
            roomsInspected: ["Living Room", "Kitchen", "Bathroom", "Bedroom"],
            overallCondition: "Good",
            rating: "8/10",
            photosAttached: 8,
            issuesFound: [],
            nextInspectionDue: "2026-04-01",
            inspectorNotes: "Property well-maintained by tenant"
        },
        'CheckOutConfirmed': {
            propertyId: propertyId,
            keysReturnedVerified: true,
            keysReturned: 2,
            accessCardsReturned: 1,
            finalInspectionPassed: true,
            depositStatus: "Full deposit approved for return",
            depositAmount: 5000,
            finalCondition: "Excellent",
            damagesNoted: "None",
            cleaningStatus: "Professional cleaning completed",
            approvalNotes: "Property returned in excellent condition, tenant was exemplary",
            approvedAt: new Date().toISOString(),
            finalMeterReadings: {
                electricity: "15892 kWh",
                water: "9876 m³",
                gas: "4123 m³"
            }
        }
    };
    
    // TENANT Templates - Fixed keys for each event type
    const tenantTemplates = {
        'CheckInConfirmed': {
            propertyId: propertyId,
            checkInTime: new Date().toISOString(),
            condition: "Excellent - property received in pristine condition",
            keysReceived: 2,
            accessCardsReceived: 1,
            keyHandedOver: true,
            initialMeterReadings: {
                electricity: "12458 kWh",
                water: "8932 m³",
                gas: "3421 m³"
            },
            photosUploaded: 15,
            notes: "All facilities working properly, clean and ready to move in",
            defectsNoted: []
        },
        'InspectionLogged': {
            propertyId: propertyId,
            issueType: "Plumbing - Minor leak in bathroom sink",
            severity: "Medium",
            reportedBy: "Tenant",
            reportedAt: new Date().toISOString(),
            description: "Small drip from bathroom sink pipe, started 2 days ago",
            urgency: "Non-emergency but needs attention",
            location: "Main Bathroom",
            photosEvidence: 3,
            requestMaintenance: true,
            preferredContactTime: "Weekdays 9AM-5PM",
            tenantAvailable: true
        },
        'CheckOutConfirmed': {
            propertyId: propertyId,
            checkOutTime: new Date().toISOString(),
            checkoutCondition: "Good - normal wear and tear only",
            keysReturned: 2,
            accessCardsReturned: 1,
            keyReturned: true,
            finalMeterReadings: {
                electricity: "15892 kWh",
                water: "9876 m³",
                gas: "4123 m³"
            },
            cleaningStatus: "Professional cleaning completed",
            damagesNoted: "None",
            depositReturnRequested: true,
            depositAmount: 5000,
            photosDocumentation: 12,
            finalNotes: "Thank you for the smooth rental experience"
        }
    };
    
    // Select appropriate template based on role and event type
    const currentEventType = eventTypeSelect.value;
    const templates = userRole === 'landlord' ? landlordTemplates : tenantTemplates;
    const template = templates[currentEventType];
    
    if (template) {
        metadataTextarea.value = JSON.stringify(template, null, 2);
    } else {
        // Fallback to basic template
        metadataTextarea.value = JSON.stringify({ propertyId: propertyId }, null, 2);
    }
    
    // Reset selector
    helper.value = '';
}

// Event Photos Preview (for form)
function previewEventMedia() {
    const fileInput = document.getElementById('eventPhotos');
    const previewSection = document.getElementById('eventMediaPreview');
    const previewContainer = document.getElementById('eventPreviewContainer');
    
    previewContainer.innerHTML = '';
    
    if (fileInput.files.length === 0) {
        previewSection.style.display = 'none';
        return;
    }
    
    previewSection.style.display = 'block';
    
    Array.from(fileInput.files).forEach(file => {
        const fileType = file.type.split('/')[0];
        
        if (fileType === 'image') {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = document.createElement('img');
                img.src = e.target.result;
                img.className = 'img-thumbnail';
                img.style.width = '100px';
                img.style.height = '100px';
                img.style.objectFit = 'cover';
                img.style.border = '1px solid var(--gray-700)';
                previewContainer.appendChild(img);
            };
            reader.readAsDataURL(file);
        } else if (fileType === 'video') {
            const videoIcon = document.createElement('div');
            videoIcon.className = 'd-flex align-items-center justify-content-center';
            videoIcon.style.width = '100px';
            videoIcon.style.height = '100px';
            videoIcon.style.border = '1px solid var(--gray-700)';
            videoIcon.style.borderRadius = '4px';
            videoIcon.style.background = 'var(--gray-800)';
            videoIcon.innerHTML = '<i class="fas fa-video fa-2x" style="color: var(--gray-400);"></i>';
            previewContainer.appendChild(videoIcon);
        }
    });
}

// Sample Data Functions - Uses same role-based templates
function loadSampleData(type) {
    const propertyId = document.getElementById('propertyId').value || `prop_${Math.floor(Math.random() * 1000)}`;
    const userRole = window.app ? window.app.userRole : 'landlord';
    
    // Map button type to event type
    const eventTypeMap = {
        'booking': 'BookingCreated',
        'checkin': 'CheckInConfirmed',
        'inspection': 'InspectionLogged',
        'checkout': 'CheckOutConfirmed'
    };
    
    // LANDLORD Templates - Fixed keys for each event type
    const landlordTemplates = {
        'BookingCreated': {
            propertyId: propertyId,
            propertyName: "Villa Seminyak Sunset",
            propertyAddress: "123 Modern Street, Bali",
            renterName: "Sarah Johnson",
            renterEmail: "sarah.johnson@email.com",
            rentAmount: 2500,
            currency: "USDC",
            duration: "12 months",
            depositAmount: 5000,
            moveInDate: "2025-11-01",
            moveOutDate: "2026-11-01",
            amenities: ["Parking", "Gym", "Pool", "24/7 Security"]
        },
        'CheckInConfirmed': {
            propertyId: propertyId,
            keysGiven: 2,
            accessCardsGiven: 1,
            approvalStatus: "approved",
            conditionVerified: "excellent",
            approvalNotes: "All keys handed over, tenant confirmed property condition",
            approvedAt: new Date().toISOString(),
            meterReadingsVerified: true,
            initialMeterReadings: {
                electricity: "12458 kWh",
                water: "8932 m³",
                gas: "3421 m³"
            }
        },
        'InspectionLogged': {
            propertyId: propertyId,
            inspectionType: "Regular Maintenance Check",
            inspectionDate: new Date().toISOString(),
            findings: "All systems operational, minor wear on kitchen faucet",
            roomsInspected: ["Living Room", "Kitchen", "Bathroom", "Bedroom"],
            overallCondition: "Good",
            rating: "8/10",
            photosAttached: 8,
            issuesFound: [],
            nextInspectionDue: "2026-04-01",
            inspectorNotes: "Property well-maintained by tenant"
        },
        'CheckOutConfirmed': {
            propertyId: propertyId,
            keysReturnedVerified: true,
            keysReturned: 2,
            accessCardsReturned: 1,
            finalInspectionPassed: true,
            depositStatus: "Full deposit approved for return",
            depositAmount: 5000,
            finalCondition: "Excellent",
            damagesNoted: "None",
            cleaningStatus: "Professional cleaning completed",
            approvalNotes: "Property returned in excellent condition, tenant was exemplary",
            approvedAt: new Date().toISOString(),
            finalMeterReadings: {
                electricity: "15892 kWh",
                water: "9876 m³",
                gas: "4123 m³"
            }
        }
    };
    
    // TENANT Templates - Fixed keys for each event type
    const tenantTemplates = {
        'CheckInConfirmed': {
            propertyId: propertyId,
            checkInTime: new Date().toISOString(),
            condition: "Excellent - property received in pristine condition",
            keysReceived: 2,
            accessCardsReceived: 1,
            keyHandedOver: true,
            initialMeterReadings: {
                electricity: "12458 kWh",
                water: "8932 m³",
                gas: "3421 m³"
            },
            photosUploaded: 15,
            notes: "All facilities working properly, clean and ready to move in",
            defectsNoted: []
        },
        'InspectionLogged': {
            propertyId: propertyId,
            issueType: "Plumbing - Minor leak in bathroom sink",
            severity: "Medium",
            reportedBy: "Tenant",
            reportedAt: new Date().toISOString(),
            description: "Small drip from bathroom sink pipe, started 2 days ago",
            urgency: "Non-emergency but needs attention",
            location: "Main Bathroom",
            photosEvidence: 3,
            requestMaintenance: true,
            preferredContactTime: "Weekdays 9AM-5PM",
            tenantAvailable: true
        },
        'CheckOutConfirmed': {
            propertyId: propertyId,
            checkOutTime: new Date().toISOString(),
            checkoutCondition: "Good - normal wear and tear only",
            keysReturned: 2,
            accessCardsReturned: 1,
            keyReturned: true,
            finalMeterReadings: {
                electricity: "15892 kWh",
                water: "9876 m³",
                gas: "4123 m³"
            },
            cleaningStatus: "Professional cleaning completed",
            damagesNoted: "None",
            depositReturnRequested: true,
            depositAmount: 5000,
            photosDocumentation: 12,
            finalNotes: "Thank you for the smooth rental experience"
        }
    };
    
    const eventType = eventTypeMap[type];
    if (!eventType) return;
    
    const templates = userRole === 'landlord' ? landlordTemplates : tenantTemplates;
    const metadata = templates[eventType];
    
    if (metadata) {
        document.getElementById('eventType').value = eventType;
        // Don't overwrite actor field - let user input their own wallet address
        document.getElementById('metadata').value = JSON.stringify(metadata, null, 2);
    }
}

function loadTimeline() {
    if (window.app) {
        window.app.loadTimeline();
    }
}

// Auto-populate form from timeline event
function useThisBooking(bookingId, propertyId, metadata) {
    // Populate form fields
    document.getElementById('bookingId').value = bookingId;
    document.getElementById('propertyId').value = propertyId;
    
    // Update timeline input too
    document.getElementById('timelineBookingId').value = bookingId;
    
    // Extract propertyName from metadata if available
    let infoMessage = `Booking: ${bookingId}`;
    if (metadata && metadata.propertyName) {
        infoMessage += ` | Property: ${metadata.propertyName}`;
    } else if (propertyId) {
        infoMessage += ` | Property ID: ${propertyId}`;
    }
    
    // Scroll to form
    const createEventForm = document.getElementById('createEventForm');
    if (createEventForm) {
        createEventForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    // Show success message
    if (window.app) {
        window.app.showAlert('success', `✅ Booking loaded! ${infoMessage}`);
    }
}

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ProofsyApp();
    
    // Check if should show dashboard (for testing)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('page') === 'dashboard') {
        showDashboardPage();
    }
});
