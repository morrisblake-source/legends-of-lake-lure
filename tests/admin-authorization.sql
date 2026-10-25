-- Manual integration test; run on the configured Supabase DB. All test records roll back.
begin;
update ll_private.admin_emails set email='ll-test-owner@example.invalid' where role='owner';
insert into auth.users(id,email,email_confirmed_at) values('00000000-0000-4000-8000-000000000001','ll-test-owner@example.invalid',now()),('00000000-0000-4000-8000-000000000002','ll-test-admin@example.invalid',now()),('00000000-0000-4000-8000-000000000003','ll-test-outsider@example.invalid',now());
set local role anon;
do $$ begin
 if public.ll_admin_session() is not null then raise exception 'Anonymous unexpectedly admin'; end if;
 begin perform public.ll_save_trip_configuration('lake-lure-2099',0,'{"year":2099,"teams":{"a":"Test A","b":"Test B"},"players":[{"id":"test-a","name":"Test A","index":4,"active":true,"team":"a"},{"id":"test-b","name":"Test B","index":8,"active":true,"team":"b"}],"ctp":{},"media":[],"rounds":[{"number":1,"format":"singles","points":1,"course":"apple","tee":"Blue","date":"","time":"","matches":[{"id":"2099-r1-m1","a":["test-a"],"b":["test-b"]}]},{"number":2,"format":"singles","points":1,"course":"apple","tee":"Blue","date":"","time":"","matches":[{"id":"2099-r2-m1","a":["test-a"],"b":["test-b"]}]},{"number":3,"format":"singles","points":1,"course":"apple","tee":"Blue","date":"","time":"","matches":[{"id":"2099-r3-m1","a":["test-a"],"b":["test-b"]}]},{"number":4,"format":"singles","points":1,"course":"apple","tee":"Blue","date":"","time":"","matches":[{"id":"2099-r4-m1","a":["test-a"],"b":["test-b"]}]}]}'::jsonb);raise exception 'Anonymous config write allowed';exception when insufficient_privilege then null;end;
 begin perform public.ll_list_admins();raise exception 'Anonymous admin list allowed';exception when insufficient_privilege then null;end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
do $$ begin
 if public.ll_admin_session() is not null then raise exception 'Outsider unexpectedly admin'; end if;
 begin perform public.ll_save_trip_configuration('lake-lure-2099',0,'{"year":2099,"teams":{"a":"Test A","b":"Test B"},"players":[{"id":"test-a","name":"Test A","index":4,"active":true,"team":"a"},{"id":"test-b","name":"Test B","index":8,"active":true,"team":"b"}],"ctp":{},"media":[],"rounds":[{"number":1,"format":"singles","points":1,"course":"apple","tee":"Blue","date":"","time":"","matches":[{"id":"2099-r1-m1","a":["test-a"],"b":["test-b"]}]},{"number":2,"format":"singles","points":1,"course":"apple","tee":"Blue","date":"","time":"","matches":[{"id":"2099-r2-m1","a":["test-a"],"b":["test-b"]}]},{"number":3,"format":"singles","points":1,"course":"apple","tee":"Blue","date":"","time":"","matches":[{"id":"2099-r3-m1","a":["test-a"],"b":["test-b"]}]},{"number":4,"format":"singles","points":1,"course":"apple","tee":"Blue","date":"","time":"","matches":[{"id":"2099-r4-m1","a":["test-a"],"b":["test-b"]}]}]}'::jsonb);raise exception 'Outsider write allowed';exception when insufficient_privilege then null;end;
 begin perform public.ll_change_admin('hacker@example.invalid',false);raise exception 'Outsider promotion allowed';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
do $$ begin
 if public.ll_admin_session() is distinct from 'owner' then raise exception 'Owner not recognized';end if;
 perform public.ll_list_admins();
 perform public.ll_change_admin(' LL-Test-Admin@Example.invalid ',false);
 begin perform public.ll_change_admin('ll-test-owner@example.invalid',true);raise exception 'Owner removed';exception when raise_exception then if SQLERRM='Owner removed' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
do $$ begin
 if public.ll_admin_session() is distinct from 'admin' then raise exception 'Approved admin not recognized';end if;
 begin perform public.ll_list_admins();raise exception 'Admin read email list';exception when insufficient_privilege then null;end;
 begin perform public.ll_change_admin('another@example.invalid',false);raise exception 'Admin granted admin';exception when insufficient_privilege then null;end;
 perform public.ll_save_trip_configuration('lake-lure-2099',0,'{"year":2099,"teams":{"a":"Test A","b":"Test B"},"players":[{"id":"test-a","name":"Test A","index":4,"active":true,"team":"a"},{"id":"test-b","name":"Test B","index":8,"active":true,"team":"b"}],"ctp":{},"media":[],"rounds":[{"number":1,"format":"singles","points":1,"course":"apple","tee":"Blue","date":"","time":"","matches":[{"id":"2099-r1-m1","a":["test-a"],"b":["test-b"]}]},{"number":2,"format":"singles","points":1,"course":"apple","tee":"Blue","date":"","time":"","matches":[{"id":"2099-r2-m1","a":["test-a"],"b":["test-b"]}]},{"number":3,"format":"singles","points":1,"course":"apple","tee":"Blue","date":"","time":"","matches":[{"id":"2099-r3-m1","a":["test-a"],"b":["test-b"]}]},{"number":4,"format":"singles","points":1,"course":"apple","tee":"Blue","date":"","time":"","matches":[{"id":"2099-r4-m1","a":["test-a"],"b":["test-b"]}]}]}'::jsonb);
 begin perform public.ll_save_trip_configuration('lake-lure-2099',0,'{"year":2099,"teams":{"a":"Test A","b":"Test B"},"players":[{"id":"test-a","name":"Test A","index":4,"active":true,"team":"a"},{"id":"test-b","name":"Test B","index":8,"active":true,"team":"b"}],"ctp":{},"media":[],"rounds":[{"number":1,"format":"singles","points":1,"course":"apple","tee":"Blue","date":"","time":"","matches":[{"id":"2099-r1-m1","a":["test-a"],"b":["test-b"]}]},{"number":2,"format":"singles","points":1,"course":"apple","tee":"Blue","date":"","time":"","matches":[{"id":"2099-r2-m1","a":["test-a"],"b":["test-b"]}]},{"number":3,"format":"singles","points":1,"course":"apple","tee":"Blue","date":"","time":"","matches":[{"id":"2099-r3-m1","a":["test-a"],"b":["test-b"]}]},{"number":4,"format":"singles","points":1,"course":"apple","tee":"Blue","date":"","time":"","matches":[{"id":"2099-r4-m1","a":["test-a"],"b":["test-b"]}]}]}'::jsonb);raise exception 'Stale revision allowed';exception when raise_exception then if SQLERRM='Stale revision allowed' then raise;end if;end;
 begin update public.trip_configurations set revision=99 where event_id='lake-lure-2099';raise exception 'Direct config write allowed';exception when insufficient_privilege then null;end;
end $$;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select public.ll_save_trip_scores('lake-lure-2099',1,'[{"match_id":"2099-r1-m1","hole":1,"scorer_id":"test-a","gross":4}]'::jsonb);
do $$ begin
 begin perform public.ll_submit_trip_ctp('lake-lure-2099',1,'test-a',10);raise exception 'Unset contest accepted';exception when raise_exception then if SQLERRM='Unset contest accepted' then raise;end if;end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
do $$ declare cfg jsonb; begin
 cfg:='{"year":2099,"teams":{"a":"Test A","b":"Test B"},"players":[{"id":"test-a","name":"Test A","index":4,"active":true,"team":"a"},{"id":"test-b","name":"Test B","index":8,"active":true,"team":"b"}],"ctp":{},"media":[],"rounds":[{"number":1,"format":"singles","points":1,"course":"apple","tee":"Blue","date":"","time":"","matches":[{"id":"2099-r1-m1","a":["test-a"],"b":["test-b"]}]},{"number":2,"format":"singles","points":1,"course":"apple","tee":"Blue","date":"","time":"","matches":[{"id":"2099-r2-m1","a":["test-a"],"b":["test-b"]}]},{"number":3,"format":"singles","points":1,"course":"apple","tee":"Blue","date":"","time":"","matches":[{"id":"2099-r3-m1","a":["test-a"],"b":["test-b"]}]},{"number":4,"format":"singles","points":1,"course":"apple","tee":"Blue","date":"","time":"","matches":[{"id":"2099-r4-m1","a":["test-a"],"b":["test-b"]}]}]}'::jsonb;cfg:=jsonb_set(cfg,'{players,0,index}','7');
 begin perform public.ll_save_trip_configuration('lake-lure-2099',1,cfg);raise exception 'Scored handicap changed';exception when raise_exception then if SQLERRM='Scored handicap changed' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select public.ll_change_admin('ll-test-admin@example.invalid',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
do $$ begin
 if public.ll_admin_session() is not null then raise exception 'Removed admin still recognized';end if;
 begin perform public.ll_save_trip_configuration('lake-lure-2099',1,'{"year":2099,"teams":{"a":"Test A","b":"Test B"},"players":[{"id":"test-a","name":"Test A","index":4,"active":true,"team":"a"},{"id":"test-b","name":"Test B","index":8,"active":true,"team":"b"}],"ctp":{},"media":[],"rounds":[{"number":1,"format":"singles","points":1,"course":"apple","tee":"Blue","date":"","time":"","matches":[{"id":"2099-r1-m1","a":["test-a"],"b":["test-b"]}]},{"number":2,"format":"singles","points":1,"course":"apple","tee":"Blue","date":"","time":"","matches":[{"id":"2099-r2-m1","a":["test-a"],"b":["test-b"]}]},{"number":3,"format":"singles","points":1,"course":"apple","tee":"Blue","date":"","time":"","matches":[{"id":"2099-r3-m1","a":["test-a"],"b":["test-b"]}]},{"number":4,"format":"singles","points":1,"course":"apple","tee":"Blue","date":"","time":"","matches":[{"id":"2099-r4-m1","a":["test-a"],"b":["test-b"]}]}]}'::jsonb);raise exception 'Removed admin write allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'All authorization, public scoring, revision and score-lock checks passed; rolling back test records.' as result;
rollback;
