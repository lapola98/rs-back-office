-- Creación de la función que gestiona el trigger
CREATE OR REPLACE FUNCTION create_company_from_onboarding()
RETURNS TRIGGER AS $$
DECLARE
  v_billing boolean := false;
  v_accounting boolean := false;
  v_treasury boolean := false;
  v_hr boolean := false;
  v_company_id uuid;
BEGIN
  -- Solo actuar si el estado cambia a 'approved' y antes era diferente de 'approved'
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    -- Evitar duplicidad si ya existe un company_id
    IF NEW.company_id IS NULL THEN
      -- Mapear servicios seleccionados en service_contracts a los módulos de la empresa
      SELECT EXISTS (
        SELECT 1 FROM service_contracts sc
        JOIN services s ON sc.service_id = s.id
        WHERE sc.onboarding_id = NEW.id AND s.name = 'Facturación y cobranza'
      ) INTO v_billing;

      SELECT EXISTS (
        SELECT 1 FROM service_contracts sc
        JOIN services s ON sc.service_id = s.id
        WHERE sc.onboarding_id = NEW.id AND s.name = 'Contabilidad'
      ) INTO v_accounting;

      SELECT EXISTS (
        SELECT 1 FROM service_contracts sc
        JOIN services s ON sc.service_id = s.id
        WHERE sc.onboarding_id = NEW.id AND s.name = 'Controller'
      ) INTO v_treasury;

      SELECT EXISTS (
        SELECT 1 FROM service_contracts sc
        JOIN services s ON sc.service_id = s.id
        WHERE sc.onboarding_id = NEW.id AND s.name = 'Nómina'
      ) INTO v_hr;

      -- Crear el registro de la empresa en la tabla companies
      INSERT INTO companies (
        name, nit, city, sector, phone, email, contact, cargo, status,
        billing_module, accounting_module, treasury_module, hr_module,
        asesor
      ) VALUES (
        NEW.company_name, NEW.company_nit, NEW.company_city, NEW.company_sector, NEW.company_phone,
        NEW.rep_email, NEW.rep_name, NEW.rep_position, 'activa',
        v_billing, v_accounting, v_treasury, v_hr,
        'Ana García' -- Asesor por defecto
      ) RETURNING id INTO v_company_id;

      -- Vincular el nuevo ID de la empresa creada a la solicitud de onboarding
      NEW.company_id := v_company_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Definición del trigger sobre la tabla client_onboardings
DROP TRIGGER IF EXISTS trigger_create_company_from_onboarding ON client_onboardings;
CREATE TRIGGER trigger_create_company_from_onboarding
  BEFORE UPDATE ON client_onboardings
  FOR EACH ROW
  EXECUTE FUNCTION create_company_from_onboarding();

-- Habilitar la extensión pg_net si no está activa
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Función del Trigger AFTER UPDATE para invocar la Edge Function invite-owner
CREATE OR REPLACE FUNCTION invoke_invite_owner_webhook()
RETURNS TRIGGER AS $$
DECLARE
  v_service_key text;
  v_url text;
BEGIN
  -- Solo actuar si el estado cambia a 'approved'
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    
    -- Obtener la clave service_role_key de forma segura desde el vault de Supabase
    SELECT decrypted_secret INTO v_service_key 
    FROM vault.decrypted_secrets 
    WHERE name = 'service_role_key' 
    LIMIT 1;

    -- URL de la Edge Function en tu proyecto Supabase
    v_url := 'https://ruuaeomceoghqxndelnm.supabase.co/functions/v1/invite-owner';

    -- Si se obtuvo la clave, realizar la llamada HTTP POST asíncrona
    IF v_service_key IS NOT NULL THEN
      PERFORM net.http_post(
        url := v_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object('onboarding_id', NEW.id)
      );
    ELSE
      -- Fallback en caso de que no requiera autenticación o use la anon key
      PERFORM net.http_post(
        url := v_url,
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object('onboarding_id', NEW.id)
      );
    END IF;

  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Definición del trigger AFTER UPDATE para enviar el webhook
DROP TRIGGER IF EXISTS trigger_invoke_invite_owner ON client_onboardings;
CREATE TRIGGER trigger_invoke_invite_owner
  AFTER UPDATE ON client_onboardings
  FOR EACH ROW
  EXECUTE FUNCTION invoke_invite_owner_webhook();
