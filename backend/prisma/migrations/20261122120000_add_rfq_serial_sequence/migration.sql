DO $$
DECLARE
  sequence_exists BOOLEAN;
  last_serial BIGINT;
BEGIN
  sequence_exists := to_regclass('public.rfq_number_seq') IS NOT NULL;
  IF NOT sequence_exists THEN
    CREATE SEQUENCE public.rfq_number_seq START WITH 1;
    SELECT MAX(substring("serialNumber" FROM '^RFQ-([0-9]+)$')::BIGINT)
      INTO last_serial
      FROM public.rfqs;
    IF last_serial IS NOT NULL THEN
      PERFORM setval('public.rfq_number_seq', last_serial, true);
    END IF;
  END IF;
END $$;
