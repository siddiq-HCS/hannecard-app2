-- إضافة جدول صلاحيات الأدوار (Role → Pages) للوحة الإدارية
CREATE TABLE "role_permissions" (
  "id" TEXT NOT NULL,
  "role" "Role" NOT NULL,
  "permission" "Permission" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "role_permissions_role_permission_key" ON "role_permissions"("role", "permission");