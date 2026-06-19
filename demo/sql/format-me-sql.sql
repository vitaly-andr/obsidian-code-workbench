-- Mis-formatted on purpose. Run "Format code file".
create table users(id integer primary key,name text not null,role text not null default 'viewer');
insert into users(id,name,role) values (1,'Ada','admin'),(2,'Bob','viewer');
select role,count(*) as total from users where created_at>='2024-01-01' group by role having count(*)>0 order by total desc;
