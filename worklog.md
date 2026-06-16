---
Task ID: 1
Agent: main
Task: Add multi-image upload support for products with separate ProductImage table

Work Log:
- Added `ProductImage` model to `prisma/schema.prisma` with fields: id, url, alt, order, productId, createdAt
- Added `images ProductImage[]` relation to Product model
- Ran `bun run db:push` to sync database schema
- Created `public/uploads/products/` directory for file storage
- Created API route `POST /api/products/images` - handles both file upload and external URL, auto-sets product.imageUrl
- Created API route `DELETE /api/products/images/[imageId]` - deletes file from filesystem and DB record, updates product.imageUrl
- Created API route `PUT /api/products/images/[imageId]` - updates image order and alt text
- Updated `GET /api/products` to include `images` relation ordered by `order asc`
- Updated `POST /api/products` to include `images` relation in response
- Updated `GET /api/products/[id]` to include `images` relation
- Updated `PUT /api/products/[id]` to include `images` relation in response
- Added `ProductImage` interface to page.tsx
- Added `images?: ProductImage[]` to Product interface
- Added `uploadingImage` and `deletingImage` state variables
- Added `handleUploadImage` and `handleDeleteImage` handler functions
- Updated Product Dialog (Add/Edit) with multi-image section: shows existing images with delete, file upload button, URL input
- Updated Product Detail Modal with image gallery: main image, thumbnail strip, admin upload button
- Updated Table View with image count badge next to product name
- Updated Card View with gallery dots indicator for multi-image products
- All lint checks pass
- API tested: upload returns 201 with image data, delete returns 200 with success

Stage Summary:
- ProductImage table created and working
- Image upload via file (multipart/form-data) and external URL both supported
- Images stored at `/uploads/products/` with UUID filenames
- Product.imageUrl auto-syncs with first image in images array
- Frontend fully updated with image management in product dialog, detail modal, table and card views
