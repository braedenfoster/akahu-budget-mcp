-- Re-date every Transaction from Akahu's instant to the Household's calendar date.
-- local_date() is a JS function that openDb registers on the connection.
UPDATE `transactions`
SET `date` = local_date(
  json_extract(`raw`, '$.date'),
  (SELECT `value` FROM `settings` WHERE `key` = 'household_timezone')
)
WHERE json_extract(`raw`, '$.date') IS NOT NULL;
