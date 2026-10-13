-- Schema of the `cisf` PostgreSQL database (as provided).
-- The gate server reads and writes these tables; it does not alter them.
-- Used by the tests to build a throwaway `cisf_test` database.

CREATE TABLE "public"."users" (
  "id" SERIAL,
  "username" VARCHAR(100) NOT NULL,
  "password_hash" TEXT NOT NULL,
  "role" VARCHAR(50) NULL DEFAULT 'operator'::character varying ,
  "full_name" VARCHAR(150) NULL,
  "last_login" TIMESTAMP WITH TIME ZONE NULL,
  "created_at" TIMESTAMP WITH TIME ZONE NULL DEFAULT CURRENT_TIMESTAMP ,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "users_username_key" UNIQUE ("username")
);
CREATE TABLE "public"."gate_config" (
  "id" SERIAL,
  "gate_name" VARCHAR(100) NOT NULL,
  "lane_name" VARCHAR(100) NOT NULL,
  "facility" VARCHAR(200) NOT NULL,
  "ministry" VARCHAR(200) NOT NULL,
  "system_status" VARCHAR(50) NULL DEFAULT 'ONLINE'::character varying ,
  "organization" VARCHAR(100) NULL DEFAULT 'CISF'::character varying ,
  "header_title" VARCHAR(255) NULL,
  CONSTRAINT "gate_config_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "public"."visitors" (
  "id" SERIAL,
  "ref_no" VARCHAR(50) NOT NULL,
  "full_name" VARCHAR(150) NOT NULL,
  "id_proof_type" VARCHAR(100) NULL,
  "id_proof_number" VARCHAR(100) NULL,
  "company" VARCHAR(150) NULL,
  "purpose" VARCHAR(150) NULL,
  "vehicle_type" VARCHAR(100) NULL,
  "pass_type" VARCHAR(100) NULL,
  "pass_number" VARCHAR(100) NULL,
  "pass_id" VARCHAR(100) NULL,
  "valid_from" VARCHAR(50) NULL,
  "valid_till" VARCHAR(50) NULL,
  "pass_status" VARCHAR(50) NULL DEFAULT 'APPROVED'::character varying ,
  "type_of_hep" VARCHAR(100) NULL,
  "aadhar_no" VARCHAR(20) NULL,
  "contact_no" VARCHAR(20) NULL,
  "frs_verified" BOOLEAN NULL DEFAULT true ,
  "frs_match_score" NUMERIC(5,2) NULL DEFAULT 95.0 ,
  "blacklist_status" VARCHAR(50) NULL DEFAULT 'CLEAR'::character varying ,
  "live_feed_camera" VARCHAR(100) NULL,
  "live_feed_image" VARCHAR(255) NULL,
  "registered_face_image" VARCHAR(255) NULL,
  "created_at" TIMESTAMP WITH TIME ZONE NULL DEFAULT CURRENT_TIMESTAMP ,
  CONSTRAINT "visitors_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "visitors_ref_no_key" UNIQUE ("ref_no")
);
CREATE TABLE "public"."gate_transactions" (
  "id" SERIAL,
  "transaction_id" VARCHAR(100) NOT NULL,
  "timestamp" TIMESTAMP WITH TIME ZONE NULL DEFAULT CURRENT_TIMESTAMP ,
  "gate_mode" VARCHAR(20) NULL DEFAULT 'ENTRY'::character varying ,
  "gate_name" VARCHAR(100) NULL DEFAULT 'GATE 0'::character varying ,
  "lane_name" VARCHAR(100) NULL DEFAULT 'Entry Lane A'::character varying ,
  "visitor_id" INTEGER NULL,
  "vehicle_id" INTEGER NULL,
  "cargo_id" INTEGER NULL,
  "visitor_status" VARCHAR(50) NULL,
  "vehicle_status" VARCHAR(50) NULL,
  "cargo_status" VARCHAR(50) NULL,
  "overall_result" VARCHAR(50) NULL,
  "operator_id" VARCHAR(50) NULL DEFAULT 'CISF-OP-042'::character varying ,
  "jwt_token" TEXT NULL,
  "remarks" TEXT NULL,
  CONSTRAINT "gate_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gate_transactions_transaction_id_key" UNIQUE ("transaction_id")
);
CREATE TABLE "public"."vehicles" (
  "id" SERIAL,
  "ref_no" VARCHAR(50) NOT NULL,
  "registration_no" VARCHAR(50) NOT NULL,
  "blacklist_status" VARCHAR(50) NULL DEFAULT 'CLEAR'::character varying ,
  "company" VARCHAR(150) NULL,
  "purpose" VARCHAR(150) NULL,
  "pass_type" VARCHAR(100) NULL,
  "pass_number" VARCHAR(100) NULL,
  "pass_id" VARCHAR(100) NULL,
  "valid_from" VARCHAR(50) NULL,
  "valid_till" VARCHAR(50) NULL,
  "pass_status" VARCHAR(50) NULL DEFAULT 'APPROVED'::character varying ,
  "anpr_verified" BOOLEAN NULL DEFAULT true ,
  "anpr_camera" VARCHAR(100) NULL,
  "anpr_feed_image" VARCHAR(255) NULL,
  "vehicle_class" VARCHAR(100) NULL,
  "weight_bridge" VARCHAR(50) NULL,
  "gross_weight" VARCHAR(50) NULL,
  "tare_weight" VARCHAR(50) NULL,
  "net_weight" VARCHAR(50) NULL,
  "created_at" TIMESTAMP WITH TIME ZONE NULL DEFAULT CURRENT_TIMESTAMP ,
  CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "public"."cargo" (
  "id" SERIAL,
  "ref_no" VARCHAR(50) NOT NULL,
  "container1_number" VARCHAR(50) NULL,
  "container1_size" VARCHAR(20) NULL,
  "container1_type" VARCHAR(20) NULL DEFAULT 'EXPORT'::character varying ,
  "container2_number" VARCHAR(50) NULL,
  "container2_size" VARCHAR(20) NULL,
  "container2_type" VARCHAR(20) NULL DEFAULT 'EXPORT'::character varying ,
  "form13_no" VARCHAR(50) NULL,
  "form13_match" BOOLEAN NULL DEFAULT true ,
  "terminal" VARCHAR(100) NULL,
  "rapi_scan_status" VARCHAR(100) NULL DEFAULT 'CLEAR'::character varying ,
  "ooc_status" VARCHAR(100) NULL DEFAULT 'COMPLETED'::character varying ,
  "cargo_verified" BOOLEAN NULL DEFAULT true ,
  "camera_feed" VARCHAR(100) NULL,
  "feed_image" VARCHAR(255) NULL,
  "cargo_type" VARCHAR(100) NULL,
  "seal_no" VARCHAR(100) NULL,
  "customs_ref_no" VARCHAR(100) NULL,
  "created_at" TIMESTAMP WITH TIME ZONE NULL DEFAULT CURRENT_TIMESTAMP ,
  CONSTRAINT "cargo_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "public"."statistics" (
  "id" SERIAL,
  "date" DATE NOT NULL,
  "gate_name" VARCHAR(100) NULL DEFAULT 'GATE 0'::character varying ,
  "total_entries" INTEGER NULL DEFAULT 0 ,
  "total_exits" INTEGER NULL DEFAULT 0 ,
  "access_granted" INTEGER NULL DEFAULT 0 ,
  "access_denied" INTEGER NULL DEFAULT 0 ,
  "pending_review" INTEGER NULL DEFAULT 0 ,
  "vehicles_in" INTEGER NULL DEFAULT 0 ,
  "vehicles_out" INTEGER NULL DEFAULT 0 ,
  "containers_processed" INTEGER NULL DEFAULT 0 ,
  "frs_matches" INTEGER NULL DEFAULT 0 ,
  "frs_mismatches" INTEGER NULL DEFAULT 0 ,
  "blacklist_hits" INTEGER NULL DEFAULT 0 ,
  "avg_processing_time_sec" INTEGER NULL DEFAULT 45 ,
  CONSTRAINT "statistics_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "public"."blacklist" (
  "id" SERIAL,
  "type" VARCHAR(50) NOT NULL,
  "identifier" VARCHAR(100) NOT NULL,
  "name" VARCHAR(150) NULL,
  "reason" TEXT NULL,
  "added_on" TIMESTAMP WITH TIME ZONE NULL,
  "added_by" VARCHAR(100) NULL,
  "status" VARCHAR(50) NULL DEFAULT 'ACTIVE'::character varying ,
  "severity" VARCHAR(50) NULL DEFAULT 'HIGH'::character varying ,
  CONSTRAINT "blacklist_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "public"."alerts" (
  "id" SERIAL,
  "type" VARCHAR(50) NOT NULL,
  "severity" VARCHAR(50) NOT NULL,
  "message" TEXT NOT NULL,
  "timestamp" TIMESTAMP WITH TIME ZONE NULL DEFAULT CURRENT_TIMESTAMP ,
  "acknowledged" BOOLEAN NULL DEFAULT false ,
  "acknowledged_by" VARCHAR(100) NULL,
  CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "public"."gate_transactions" ADD CONSTRAINT "gate_transactions_cargo_id_fkey" FOREIGN KEY ("cargo_id") REFERENCES "public"."cargo" ("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "public"."gate_transactions" ADD CONSTRAINT "gate_transactions_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles" ("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "public"."gate_transactions" ADD CONSTRAINT "gate_transactions_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors" ("id") ON DELETE SET NULL ON UPDATE NO ACTION;
