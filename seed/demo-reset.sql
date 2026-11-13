-- Empties every table the public instance's sample lives in, so the seed files
-- that follow write it from nothing. Holidays are reference data and stay.
--
-- The ordinary deploy only replaces the sample bookings. This is for when
-- anything else may have been written: a visitor's guest, a changed opening
-- hour, a record. Run by the deploy workflow when started by hand with
-- "reset" ticked. A shop would never apply it.
--
-- Children before parents: D1 enforces foreign keys.

DELETE FROM payments;
DELETE FROM booking_events;
DELETE FROM booking_items;
DELETE FROM records;
DELETE FROM bookings;
DELETE FROM customers;
DELETE FROM service_prices;
DELETE FROM services;
DELETE FROM seats;
DELETE FROM staff;
DELETE FROM business_hours;
DELETE FROM closures;
DELETE FROM currencies;
DELETE FROM failed_sign_ins;
